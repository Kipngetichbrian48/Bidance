import React, { useState, useEffect, useRef, Component } from 'react';
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
import { Chart, Pie } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { format } from 'date-fns';
import ZoomPlugin from 'chartjs-plugin-zoom';
import './App.css';

ChartJS.register(LineController, LineElement, PointElement, LinearScale, TimeScale, CategoryScale, Title, Tooltip, Legend, ArcElement, ZoomPlugin, CandlestickController, CandlestickElement);

// Error Boundary Component
class ErrorBoundary extends Component {
  state = { hasError: false, error: null };

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <p className="text-danger">Chart rendering failed: {this.state.error.message}</p>;
    }
    return this.props.children;
  }
}

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
  const [stopPrice, setStopPrice] = useState(''); // NEW: For stop-limit orders
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(''); // NEW: For 2FA
  const [verificationCode, setVerificationCode] = useState(''); // NEW: For 2FA
  const [verificationId, setVerificationId] = useState(''); // NEW: For 2FA
  const [loginError, setLoginError] = useState('');
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [depthData, setDepthData] = useState(null);
  const [wallet, setWallet] = useState({}); // NEW: Wallet balances
  const [kycStatus, setKycStatus] = useState('pending'); // NEW: KYC stub
  const canvasRef = useRef(null);
  const chartRef = useRef(null);
  const wsRef = useRef(null); // NEW: WebSocket reference
  const isMounted = useRef(true);

  // NEW: Initialize WebSocket for order book
  useEffect(() => {
    wsRef.current = new WebSocket('ws://localhost:8080');
    wsRef.current.onopen = () => console.log('WebSocket connected');
    wsRef.current.onmessage = (event) => {
      const { asset, orderBook } = JSON.parse(event.data);
      if (asset === selectedAsset) {
        setOrderBook(orderBook);
        const bidData = orderBook.bids.map(bid => ({ x: parseFloat(bid.price), y: parseFloat(bid.amount) }));
        const askData = orderBook.asks.map(ask => ({ x: parseFloat(ask.price), y: parseFloat(ask.amount) }));
        setDepthData({
          datasets: [
            { label: 'Bids', data: bidData, borderColor: '#00ff00', backgroundColor: 'rgba(0, 255, 0, 0.3)', stepped: true, fill: true },
            { label: 'Asks', data: askData, borderColor: '#ff0000', backgroundColor: 'rgba(255, 0, 0, 0.3)', stepped: true, fill: true },
          ],
        });
      }
    };
    wsRef.current.onclose = () => console.log('WebSocket disconnected');
    return () => wsRef.current.close();
  }, [selectedAsset]);

  // Authentication, trades, wallet, and KYC initialization
  useEffect(() => {
    isMounted.current = true;
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      console.log('Auth state changed:', currentUser ? currentUser.email : 'No user');
      setUser(currentUser);
      if (currentUser) {
        // Fetch trades
        const q = query(collection(db, 'trades'), where('userId', '==', currentUser.uid));
        const unsubscribeTrades = onSnapshot(q, (snapshot) => {
          const tradesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          console.log('Fetched trades from Firestore:', tradesData);
          setTrades(tradesData);
        });

        // NEW: Fetch wallet
        const walletRef = doc(db, 'wallets', currentUser.uid);
        const walletSnap = await getDoc(walletRef);
        if (walletSnap.exists()) {
          setWallet(walletSnap.data());
        } else {
          const initialWallet = { usd: 10000, bitcoin: 0, ethereum: 0, litecoin: 0, ripple: 0, cardano: 0, solana: 0 };
          await setDoc(walletRef, initialWallet);
          setWallet(initialWallet);
        }

        // NEW: Fetch KYC status
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
        const response = await axios.get('http://localhost:3000/api/price');
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

  // REMOVED: Static order book/depth chart fetch (replaced by WebSocket)

  const fetchChartData = async (asset, days) => {
    try {
      console.log(`Fetching OHLC data for ${asset}, ${days} days`);
      const response = await axios.get(`http://localhost:3000/api/ohlc/${asset}/${days}`);
      console.log(`Fetched OHLC data from http://localhost:3000/api/ohlc/${asset}/${days}:`, response.data);
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
  };

  const handleTimeRangeChange = (e) => {
    const days = e.target.value;
    console.log(`Switching to time range: ${days} days`);
    setSelectedTimeRange(days);
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
    // NEW: Check KYC status
    if (kycStatus !== 'verified') {
      alert('Please complete KYC verification to trade');
      return;
    }

    // NEW: Check wallet balance
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
      stopPrice: orderType === 'stop-limit' ? parseFloat(stopPrice) : null, // NEW: Stop price
      timestamp: Date.now(),
    };

    try {
      console.log('Saving trade to Firestore:', trade);
      await addDoc(collection(db, 'trades'), trade);

      // NEW: Update wallet
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

      // NEW: Send order to WebSocket for limit/stop-limit
      if (orderType !== 'market') {
        wsRef.current.send(JSON.stringify({ asset: selectedAsset, order: { price: trade.price, amount: trade.amount, type: tradeType } }));
      }

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
        setVerificationId('pending'); // Trigger 2FA setup
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

  // NEW: 2FA Setup
  const handle2FASetup = async () => {
    try {
      const recaptchaVerifier = new RecaptchaVerifier('recaptcha-container', { size: 'invisible' }, auth);
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

  // NEW: 2FA Verification
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

  // NEW: KYC Submission (Stub)
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
            <p>KYC Status: {kycStatus}</p> {/* NEW: Show KYC status */}
            <p>USD Balance: ${wallet.usd?.toFixed(2) || '0.00'}</p> {/* NEW: Show USD balance */}
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
              {/* NEW: 2FA Inputs */}
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
            {/* NEW: KYC Warning */}
            {kycStatus !== 'verified' && (
              <div className="alert alert-warning">
                <p>KYC verification required to trade.</p>
                <button className="btn btn-primary" onClick={handleKYCSubmit}>Submit KYC (Simulated)</button>
              </div>
            )}
            <ul className="nav nav-tabs mb-3">
              <li className="nav-item">
                <button className="nav-link active" data-bs-toggle="tab" data-bs-target="#prices">Prices</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#charts">Charts</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#trade">Trade</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#history">Trade History</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#analytics">Analytics</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#orderbook">Order Book</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#depth">Depth Chart</button>
              </li>
              <li className="nav-item">
                <button className="nav-link" data-bs-toggle="tab" data-bs-target="#wallet">Wallet</button> {/* NEW: Wallet tab */}
              </li>
            </ul>

            <div className="tab-content">
              <div className="tab-pane fade show active" id="prices">
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

              <div className="tab-pane fade" id="charts">
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
                <ErrorBoundary>
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
                </ErrorBoundary>
              </div>

              <div className="tab-pane fade" id="trade">
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
                    <option value="stop-limit">Stop-Limit</option> {/* NEW: Stop-limit option */}
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

              <div className="tab-pane fade" id="history">
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

              <div className="tab-pane fade" id="analytics">
                <h2>Analytics</h2>
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
              </div>

              <div className="tab-pane fade" id="orderbook">
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

              <div className="tab-pane fade" id="depth">
                <h2>Depth Chart</h2>
                <div className="chart-container">
                  {depthData ? (
                    <Chart
                      type="line"
                      data={depthData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                          x: {
                            title: { display: true, text: 'Price (USD)', color: '#ffffff' },
                            grid: { color: '#333333' },
                          },
                          y: {
                            title: { display: true, text: 'Amount', color: '#ffffff' },
                            grid: { color: '#333333' },
                          },
                        },
                        plugins: {
                          legend: { labels: { color: '#ffffff' } },
                          tooltip: { backgroundColor: '#212121', titleColor: '#ffffff', bodyColor: '#ffffff' },
                        },
                      }}
                    />
                  ) : (
                    <p>Loading depth chart...</p>
                  )}
                </div>
              </div>

              {/* NEW: Wallet Tab */}
              <div className="tab-pane fade" id="wallet">
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