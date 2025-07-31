import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { auth, db } from './firebase';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  multiFactor,
  PhoneAuthProvider,
  PhoneMultiFactorGenerator,
  RecaptchaVerifier,
} from 'firebase/auth';
import { collection, addDoc, onSnapshot, query, where, doc, setDoc, getDoc } from 'firebase/firestore';
import axios from 'axios';
import { Chart as ChartJS, LineController, LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { CandlestickController, CandlestickElement } from 'chartjs-chart-financial';
import 'chartjs-adapter-date-fns';
import { format } from 'date-fns';
import ZoomPlugin from 'chartjs-plugin-zoom';
import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';

// Register Chart.js plugins (must be done before lazy-loading Chart and Pie)
ChartJS.register(LineController, LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Title, Tooltip, Legend, ArcElement, ZoomPlugin, CandlestickController, CandlestickElement);

// Lazy-load Chart and Pie from react-chartjs-2
const Chart = lazy(() => import('react-chartjs-2').then(module => ({ default: module.Chart })));
const Pie = lazy(() => import('react-chartjs-2').then(module => ({ default: module.Pie })));

// Lazy-load DepthChart (to be created in DepthChart.js)
const DepthChart = lazy(() => import('./DepthChart'));

const App = () => {
  const [user, setUser] = useState(null);
  const [prices, setPrices] = useState({});
  const [chartData, setChartData] = useState(null);
  const [chartError, setChartError] = useState('');
  const [selectedAsset, setSelectedAsset] = useState('bitcoin');
  const [selectedTimeRange, setSelectedTimeRange] = useState('7');
  const [trades, setTrades] = useState([]);
  const [tradeAmount, setTradeAmount] = useState('');
  const [tradeType, setTradeType] = useState('buy');
  const [orderType, setOrderType] = useState('market');
  const [limitPrice, setLimitPrice] = useState('');
  const [stopPrice, setStopPrice] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [loginError, setLoginError] = useState('');
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [depthChartError, setDepthChartError] = useState(''); // eslint-disable-line no-unused-vars
  const [wallet, setWallet] = useState({});
  const [kycStatus, setKycStatus] = useState('pending');
  const [activeTab, setActiveTab] = useState('prices');
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const pollingRef = useRef(null);
  const isMounted = useRef(true);

  // Initialize HTTP polling for order book
  useEffect(() => {
    const fetchOrderBook = async () => {
      try {
        const response = await axios.get(`https://bidance-cv0um1d0o-kipngetich-brians-projects.vercel.app/api/orderbook/${selectedAsset}`);
        const data = response.data;
        console.log('Received order book data:', JSON.stringify(data, null, 2));
        if (data && Array.isArray(data.bids) && Array.isArray(data.asks)) {
          setOrderBook(data);
          setDepthChartError('');
        } else {
          console.warn('Invalid order book data format:', JSON.stringify(data, null, 2));
          setDepthChartError('Invalid order book data format');
        }
      } catch (error) {
        console.error('Order book fetch error:', error.message);
        setDepthChartError(`Failed to fetch order book: ${error.message}`);
      }
    };

    fetchOrderBook(); // Initial fetch
    pollingRef.current = setInterval(fetchOrderBook, 1000); // Poll every 1s

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        console.log('Order book polling stopped');
      }
    };
  }, [selectedAsset]);

  // Authentication, trades, wallet, and KYC initialization
  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Auth state changed:', currentUser ? currentUser.email : 'No user');
      setUser(currentUser);
      if (currentUser) {
        const q = query(collection(db, 'trades'), where('userId', '==', currentUser.uid));
        const unsubscribeTrades = onSnapshot(q, (snapshot) => {
          const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          console.log('Fetched trades from Firestore:', tradesData);
          setTrades(tradesData);
        });

        const walletRef = doc(db, 'wallets', currentUser.uid);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          setWallet(walletSnap.data());
        } else {
          const initialWallet = { usd: 10000, bitcoin: 0, ethereum: 0, litecoin: 0, ripple: 0, cardano: 0, solana: 0 };
          await setDoc(walletRef, initialWallet);
          setWallet(initialWallet);
        }

        const kycRef = doc(db, 'kyc', currentUser.uid);
        const kycSnap = await getDoc(kycRef);
        if (kycSnap.exists()) {
          setKycStatus(kycSnap.data().status);
        } else {
          await setDoc(kycRef, { status: 'pending' });
          setKycStatus('pending');
        }

        return () => unsubscribeTrades();
      } else {
        setTrades([]);
        setWallet({});
        setKycStatus('pending');
      }
    });

    const fetchPrices = async () => {
      try {
        console.log('Fetching prices from server');
        const response = await axios.get('https://bidance-cv0um1d0o-kipngetich-brians-projects.vercel.app/api/price');
        console.log('Fetched prices:', JSON.stringify(response.data).slice(0, 100));
        setPrices(response.data);
      } catch (error) {
        console.error('Error fetching prices:', error.message, error.response?.data);
      }
    };

    fetchPrices();
    const priceInterval = setInterval(fetchPrices, 5000);
    return () => {
      clearInterval(priceInterval);
      isMounted.current = false;
      unsubscribe();
    };
  }, []);

  // Fetch chart data for candlestick chart
  useEffect(() => {
    fetchChartData(selectedAsset, selectedTimeRange);
    return () => {
      if (chartRef.current && isMounted.current) {
        console.log(`Destroying chart for ${selectedAsset}`);
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [selectedAsset, selectedTimeRange]);

  const fetchChartData = async (asset, days) => {
    try {
      console.log(`Fetching OHLC data for ${asset}, ${days} days`);
      const response = await axios.get(`https://bidance-cv0um1d0o-kipngetich-brians-projects.vercel.app/api/ohlc/${asset}/${days}`);
      console.log(`Fetched OHLC data from https://bidance-cv0um1d0o-kipngetich-brians-projects.vercel.app/api/ohlc/${asset}/${days}:`, response.data);
      const data = response.data.map(([timestamp, open, high, low, close]) => ({
        x: timestamp,
        o: open,
        h: high,
        l: low,
        c: close,
      }));
      console.log(`Chart data for ${asset}: ${data.length} points`);

      if (isMounted.current) {
        setTimeout(() => {
          setChartData({
            datasets: [
              {
                label: `${asset.charAt(0).toUpperCase() + asset.slice(1)} Candlestick`,
                data,
                borderColor: '#f0b90b',
                backgroundColor: (context) => {
                  const { o, c } = context.raw || {};
                  return c >= o ? '#00ff00' : '#ff0000';
                },
              },
            ],
          });
          setChartError('');
        }, 100);
      }
    } catch (error) {
      console.error(`Error fetching OHLC data for ${asset}:`, error.message, error.response?.data);
      if (isMounted.current) {
        setChartData(null);
        setChartError(`Failed to load chart for ${asset}: ${error.response?.data?.details || error.message}`);
      }
    }
  };

  const handleAssetChange = (e) => {
    const asset = e.target.value;
    console.log(`Switching to asset: ${asset}`);
    setSelectedAsset(asset);
    setOrderBook({ bids: [], asks: [] }); // Reset orderBook to trigger fetch
  };

  const handleTimeRangeChange = (e) => {
    const days = e.target.value;
    console.log(`Switching to time range: ${days} days`);
    setSelectedTimeRange(days);
  };

  const handleTabChange = (tab) => {
    console.log('handleTabChange called with tab:', tab);
    setActiveTab(tab);
    setTimeout(() => {
      console.log('activeTab state updated to:', tab);
      const tabs = document.querySelectorAll('.tab-pane');
      tabs.forEach(t => t.classList.remove('active', 'show'));
      const tabPane = document.querySelector(`#${tab}`);
      if (tabPane) {
        tabPane.classList.add('active', 'show');
        console.log(`Forced active show classes on #${tab}:`, tabPane.classList.toString());
      } else {
        console.log(`Tab element #${tab} not found`);
      }
    }, 0);
  };

  const handleTrade = async () => {
    if (!user) {
      alert('Please log in to trade');
      return;
    }
    if (!tradeAmount || isNaN(tradeAmount) || tradeAmount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (orderType === 'limit' && (!limitPrice || isNaN(limitPrice) || limitPrice <= 0)) {
      alert('Please enter a valid limit price');
      return;
    }
    if (orderType === 'stop-limit' && (!limitPrice || isNaN(limitPrice) || limitPrice <= 0 || !stopPrice || isNaN(stopPrice) || stopPrice <= 0)) {
      alert('Please enter valid limit and stop prices');
      return;
    }
    if (!prices[selectedAsset]?.usd) {
      alert(`Price data for ${selectedAsset} is not available`);
      return;
    }
    if (kycStatus !== 'verified') {
      alert('Please complete KYC verification to trade');
      return;
    }

    const totalCost = orderType === 'limit' || orderType === 'stop-limit' ? parseFloat(tradeAmount) * parseFloat(limitPrice) : parseFloat(tradeAmount) * prices[selectedAsset].usd;
    if (tradeType === 'buy' && wallet.usd < totalCost) {
      alert('Insufficient USD balance');
      return;
    }
    if (tradeType === 'sell' && wallet[selectedAsset] < parseFloat(tradeAmount)) {
      alert(`Insufficient ${selectedAsset} balance`);
      return;
    }

    const trade = {
      userId: user.uid,
      asset: selectedAsset,
      type: tradeType,
      orderType,
      amount: parseFloat(tradeAmount),
      price: orderType === 'market' ? prices[selectedAsset].usd : parseFloat(limitPrice),
      stopPrice: orderType === 'stop-limit' ? parseFloat(stopPrice) : null,
      timestamp: Date.now(),
    };

    try {
      console.log('Saving trade to Firestore:', trade);
      await addDoc(collection(db, 'trades'), trade);

      const walletRef = doc(db, 'wallets', user.uid);
      const newWallet = { ...wallet };
      if (tradeType === 'buy') {
        newWallet.usd -= totalCost;
        newWallet[selectedAsset] += parseFloat(tradeAmount);
      } else {
        newWallet.usd += totalCost;
        newWallet[selectedAsset] -= parseFloat(tradeAmount);
      }
      await setDoc(walletRef, newWallet);
      setWallet(newWallet);

      console.log('Trade saved successfully');
      setTradeAmount('');
      setLimitPrice('');
      setStopPrice('');
    } catch (error) {
      console.error('Error saving trade:', error.message);
      alert(`Failed to save trade: ${error.message}`);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      if (multiFactor(user).enrolledFactors.length === 0) {
        alert('2FA setup required. Please provide your phone number.');
        setVerificationId('pending');
      } else {
        console.log('Login successful:', email);
        setLoginError('');
        setEmail('');
        setPassword('');
      }
    } catch (error) {
      console.error('Login error:', error.message);
      setLoginError(error.message);
    }
  };

  const handle2FASetup = async () => {
    try {
      const recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      const phoneInfoOptions = {
        phoneNumber,
        session: await multiFactor(user).getSession(),
      };
      const phoneAuthProvider = new PhoneAuthProvider(auth);
      const verificationId = await phoneAuthProvider.verifyPhoneNumber(phoneInfoOptions, recaptchaVerifier);
      setVerificationId(verificationId);
    } catch (error) {
      console.error('2FA setup error:', error.message);
      setLoginError(error.message);
    }
  };

  const handle2FAVerify = async () => {
    try {
      const credential = PhoneAuthProvider.credential(verificationId, verificationCode);
      const multiFactorAssertion = PhoneMultiFactorGenerator.assertion(credential);
      await multiFactor(user).enroll(multiFactorAssertion, 'phone');
      console.log('2FA enrolled successfully');
      setVerificationId('');
      setPhoneNumber('');
      setVerificationCode('');
      setLoginError('');
    } catch (error) {
      console.error('2FA verification error:', error.message);
      setLoginError(error.message);
    }
  };

  const handleKYCSubmit = async () => {
    try {
      const kycRef = doc(db, 'kyc', user.uid);
      await setDoc(kycRef, { status: 'verified' });
      setKycStatus('verified');
      alert('KYC verification submitted (simulated).');
    } catch (error) {
      console.error('KYC submission error:', error.message);
      alert('KYC submission failed: ' + error.message);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      console.log('Sign out successful');
    } catch (error) {
      console.error('Sign out error:', error.message);
    }
  };

  const handleExportCSV = () => {
    const headers = ['ID', 'Asset', 'Type', 'Order Type', 'Amount', 'Price', 'Stop Price', 'Timestamp'];
    const rows = trades.map(trade => [
      trade.id,
      trade.asset,
      trade.type,
      trade.orderType,
      trade.amount,
      trade.price,
      trade.stopPrice || 'N/A',
      format(trade.timestamp, 'PPp'),
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `trades_${format(Date.now(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const assets = ['bitcoin', 'ethereum', 'litecoin', 'ripple', 'cardano', 'solana'];

  const pieChartData = {
    labels: assets,
    datasets: [
      {
        data: assets.map(asset =>
          trades
            .filter(trade => trade.asset === asset)
            .reduce((sum, trade) => sum + trade.amount * trade.price, 0)
        ),
        backgroundColor: ['#f0b90b', '#627eea', '#00ff00', '#ff5733', '#c70039', '#00b7eb'],
      },
    ],
  };

  const tradePreview = {
    total: orderType === 'limit' || orderType === 'stop-limit' ? (parseFloat(tradeAmount) || 0) * (parseFloat(limitPrice) || 0)
          : (parseFloat(tradeAmount) || 0) * (prices[selectedAsset]?.usd || 0),
    fee: ((parseFloat(tradeAmount) || 0) * (orderType === 'limit' || orderType === 'stop-limit' ? parseFloat(limitPrice) || 0 : prices[selectedAsset]?.usd || 0) * 0.001).toFixed(2),
  };

  return (
    <div>
      <div className="header">
        <div className="header-logo">Bidance</div>
        {user && (
          <div className="header-user">
            <p>{user.email}</p>
            <p>KYC Status: {kycStatus}</p>
            <p>USD Balance: ${wallet.usd?.toFixed(2) || '0.00'}</p>
            <button className="btn btn-signout" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        )}
      </div>

      <div className="ticker">
        <ul>
          {assets.map(asset => (
            <li key={asset}>
              {asset.toUpperCase()}/USD: ${prices[asset]?.usd || 'N/A'}
            </li>
          ))}
        </ul>
      </div>

      <div className="container mt-4">
        {!user ? (
          <div className="login-form">
            <h3>Login</h3>
            <form onSubmit={handleLogin}>
              <div className="mb-3">
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  required
                />
              </div>
              <div className="mb-3">
                <input
                  type="password"
                  className="form-control"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  required
                />
              </div>
              {verificationId && (
                <>
                  <div className="mb-3">
                    <input
                      type="tel"
                      className="form-control"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Phone Number (e.g., +1234567890)"
                    />
                    <button type="button" className="btn btn-secondary mt-2" onClick={handle2FASetup}>
                      Send 2FA Code
                    </button>
                  </div>
                  {verificationId !== 'pending' && (
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="Verification Code"
                      />
                      <button type="button" className="btn btn-secondary mt-2" onClick={handle2FAVerify}>
                        Verify 2FA
                      </button>
                    </div>
                  )}
                  <div id="recaptcha-container"></div>
                </>
              )}
              {loginError && <p className="text-danger">{loginError}</p>}
              <button type="submit" className="btn btn-primary">Login</button>
            </form>
          </div>
        ) : (
          <>
            {kycStatus !== 'verified' && (
              <div className="alert alert-warning">
                <p>KYC verification required to trade.</p>
                <button className="btn btn-primary" onClick={handleKYCSubmit}>Submit KYC (Simulated)</button>
              </div>
            )}
            <ul className="nav nav-tabs mb-3">
              {['prices', 'charts', 'trade', 'history', 'analytics', 'orderbook', 'depth', 'wallet'].map(tab => (
                <li className="nav-item" key={tab}>
                  <button
                    className={`nav-link ${activeTab === tab ? 'active' : ''}`}
                    onClick={() => handleTabChange(tab)}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1).replace('orderbook', 'Order Book').replace('depth', 'Depth Chart')}
                  </button>
                </li>
              ))}
            </ul>

            <div className="tab-content">
              <div className={`tab-pane ${activeTab === 'prices' ? 'active show' : ''}`} id="prices">
                <h2>Prices</h2>
                {Object.keys(prices).length === 0 ? (
                  <p>Loading prices...</p>
                ) : (
                  <ul className="list-group">
                    {assets.map((asset) => (
                      <li key={asset} className="list-group-item">
                        {asset.charAt(0).toUpperCase() + asset.slice(1)}: ${prices[asset]?.usd || 'N/A'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`tab-pane ${activeTab === 'charts' ? 'active show' : ''}`} id="charts">
                <h2>Charts</h2>
                <div className="mb-3">
                  <select className="form-select d-inline w-auto me-2" value={selectedAsset} onChange={handleAssetChange}>
                    {assets.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset.charAt(0).toUpperCase() + asset.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select className="form-select d-inline w-auto" value={selectedTimeRange} onChange={handleTimeRangeChange}>
                    <option value="1">1 Day</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                  </select>
                </div>
                <Suspense fallback={<p>Loading chart...</p>}>
                  {chartError && <p className="text-danger">{chartError}</p>}
                  {chartData && canvasRef.current ? (
                    <div className="chart-container">
                      <Chart
                        type="candlestick"
                        key={`${selectedAsset}-${selectedTimeRange}`}
                        ref={(chart) => {
                          console.log(`Setting chartRef for ${selectedAsset}:`, chart);
                          if (chart && canvasRef.current) {
                            chartRef.current = chart;
                          }
                        }}
                        data={chartData}
                        options={{
                          responsive: true,
                          maintainAspectRatio: false,
                          scales: {
                            x: {
                              type: 'time',
                              time: {
                                unit: selectedTimeRange === '1' ? 'hour' : 'day',
                              },
                              grid: { color: '#333333' },
                            },
                            y: {
                              beginAtZero: false,
                              title: {
                                display: true,
                                text: 'Price (USD)',
                                color: '#ffffff',
                              },
                              grid: { color: '#333333' },
                            },
                          },
                          plugins: {
                            legend: { labels: { color: '#ffffff' } },
                            tooltip: { backgroundColor: '#212121', titleColor: '#ffffff', bodyColor: '#ffffff' },
                            zoom: {
                              zoom: {
                                wheel: { enabled: true },
                                pinch: { enabled: true },
                                mode: 'xy',
                              },
                              pan: { enabled: true, mode: 'xy' },
                            },
                          },
                        }}
                      />
                    </div>
                  ) : (
                    <p>{chartError ? `Error loading chart: ${chartError}` : 'Loading chart...'}</p>
                  )}
                  <canvas ref={canvasRef} style={{ display: 'block' }} />
                </Suspense>
              </div>

              <div className={`tab-pane ${activeTab === 'trade' ? 'active show' : ''}`} id="trade">
                <h2>Trade</h2>
                <div className="trade-form">
                  <select className="form-select w-auto" value={selectedAsset} onChange={handleAssetChange}>
                    {assets.map((asset) => (
                      <option key={asset} value={asset}>
                        {asset.charAt(0).toUpperCase() + asset.slice(1)}
                      </option>
                    ))}
                  </select>
                  <select
                    className="form-select w-auto"
                    value={orderType}
                    onChange={(e) => setOrderType(e.target.value)}
                  >
                    <option value="market">Market</option>
                    <option value="limit">Limit</option>
                    <option value="stop-limit">Stop-Limit</option>
                  </select>
                  <select
                    className="form-select w-auto"
                    value={tradeType}
                    onChange={(e) => setTradeType(e.target.value)}
                  >
                    <option value="buy">Buy</option>
                    <option value="sell">Sell</option>
                  </select>
                  <input
                    type="number"
                    className="form-control w-auto"
                    value={tradeAmount}
                    onChange={(e) => setTradeAmount(e.target.value)}
                    placeholder="Amount"
                  />
                  {(orderType === 'limit' || orderType === 'stop-limit') && (
                    <input
                      type="number"
                      className="form-control w-auto"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder="Limit Price"
                    />
                  )}
                  {orderType === 'stop-limit' && (
                    <input
                      type="number"
                      className="form-control w-auto"
                      value={stopPrice}
                      onChange={(e) => setStopPrice(e.target.value)}
                      placeholder="Stop Price"
                    />
                  )}
                  <button className="btn btn-primary" onClick={handleTrade} disabled={kycStatus !== 'verified'}>
                    Execute Trade
                  </button>
                </div>
                <p>Current Price: ${prices[selectedAsset]?.usd || 'N/A'}</p>
                {(tradeAmount && prices[selectedAsset]?.usd) || (orderType === 'limit' && limitPrice) || (orderType === 'stop-limit' && limitPrice && stopPrice) ? (
                  <div className="trade-preview">
                    <p>Total: ${tradePreview.total.toFixed(2)}</p>
                    <p>Fee (0.1%): ${tradePreview.fee}</p>
                  </div>
                ) : null}
              </div>

              <div className={`tab-pane ${activeTab === 'history' ? 'active show' : ''}`} id="history">
                <h2>Trade History</h2>
                <button className="btn btn-primary mb-3" onClick={handleExportCSV}>Export to CSV</button>
                {trades.length === 0 ? (
                  <p>No trades yet.</p>
                ) : (
                  <ul className="list-group">
                    {trades.map((trade) => (
                      <li key={trade.id} className="list-group-item">
                        {trade.type.toUpperCase()} {trade.amount} {trade.asset.toUpperCase()} at ${trade.price} ({trade.orderType})
                        {trade.stopPrice ? `, Stop: $${trade.stopPrice}` : ''} on {format(trade.timestamp, 'PPp')}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className={`tab-pane ${activeTab === 'analytics' ? 'active show' : ''}`} id="analytics">
                <h2>Analytics</h2>
                <Suspense fallback={<p>Loading analytics...</p>}>
                  {trades.length === 0 ? (
                    <p>No trades to analyze.</p>
                  ) : (
                    <>
                      <p>Total Trades: {trades.length}</p>
                      <p>
                        Total Volume: $
                        {trades.reduce((sum, trade) => sum + trade.amount * trade.price, 0).toFixed(2)}
                      </p>
                      <div className="pie-chart-container">
                        <h3>Trade Distribution by Asset</h3>
                        <Pie
                          data={pieChartData}
                          options={{
                            responsive: true,
                            plugins: {
                              legend: { labels: { color: '#ffffff' } },
                            },
                          }}
                        />
                      </div>
                    </>
                  )}
                </Suspense>
              </div>

              <div className={`tab-pane ${activeTab === 'orderbook' ? 'active show' : ''}`} id="orderbook">
                <h2>Order Book</h2>
                <div className="order-book">
                  <div className="order-book-section">
                    <h3>Bids</h3>
                    <table className="table table-dark">
                      <thead>
                        <tr>
                          <th>Price (USD)</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderBook.bids.map((bid, index) => (
                          <tr key={`bid-${index}`}>
                            <td className="text-success">{bid.price}</td>
                            <td>{bid.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="order-book-section">
                    <h3>Asks</h3>
                    <table className="table table-dark">
                      <thead>
                        <tr>
                          <th>Price (USD)</th>
                          <th>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderBook.asks.map((ask, index) => (
                          <tr key={`ask-${index}`}>
                            <td className="text-danger">{ask.price}</td>
                            <td>{ask.amount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className={`tab-pane ${activeTab === 'depth' ? 'active show' : ''}`} id="depth">
                <h2>Depth Chart</h2>
                <Suspense fallback={<p>Loading depth chart...</p>}>
                  <DepthChart
                    orderBook={orderBook}
                    setDepthChartError={setDepthChartError}
                    isActive={activeTab === 'depth'}
                    activeTab={activeTab}
                  />
                </Suspense>
              </div>

              <div className={`tab-pane ${activeTab === 'wallet' ? 'active show' : ''}`} id="wallet">
                <h2>Wallet</h2>
                <ul className="list-group">
                  <li className="list-group-item">USD: ${wallet.usd?.toFixed(2) || '0.00'}</li>
                  {assets.map((asset) => (
                    <li key={asset} className="list-group-item">
                      {asset.charAt(0).toUpperCase() + asset.slice(1)}: {wallet[asset]?.toFixed(6) || '0.000000'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default App;