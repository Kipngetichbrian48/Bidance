import React, { useState, useEffect, useCallback } from 'react';
import { auth } from './firebase';
import axios from 'axios';
import { Container, Nav, Navbar, NavDropdown, Form, Button, Alert } from 'react-bootstrap';
import Chart from './chart'; // Case-sensitive
import DepthChart from './DepthChart';
import PieChart from './PieChart';
import './App.css';
import debounce from 'lodash/debounce';

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('prices');
  const [prices, setPrices] = useState({});
  const [asset, setAsset] = useState('bitcoin');
  const [days, setDays] = useState('7');
  const [ohlcData, setOhlcData] = useState([]);
  const [orderBook, setOrderBook] = useState({ bids: [], asks: [] });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [kycData, setKycData] = useState({ name: '', idNumber: '', address: '', documentType: 'Aadhaar' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [kycStatus, setKycStatus] = useState('pending');

  // Check auth state and KYC status
  useEffect(() => {
    console.log('App.js: Checking auth state');
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        const idTokenResult = await user.getIdTokenResult(true); // Force refresh for claims
        const kycVerified = idTokenResult.claims.kycVerified || false;
        setKycStatus(kycVerified ? 'verified' : 'pending');
        console.log('App.js: User authenticated:', user.email, 'KYC Status:', kycVerified);
      } else {
        setUser(null);
        setPrices({});
        setOhlcData([]);
        setOrderBook({ bids: [], asks: [] });
        setKycStatus('pending');
        console.log('App.js: No user logged in');
      }
    });
    return () => {
      console.log('App.js: Cleaning up auth subscription');
      unsubscribe();
    };
  }, []);

  // Fetch price, OHLC, and order book data concurrently
  const fetchData = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    try {
      console.log('App.js: Fetching data for', asset);
      const [priceResponse, ohlcResponse, orderBookResponse] = await Promise.all([
        axios.get('http://localhost:3000/api/price', {
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => {
          console.error('App.js: Price fetch error:', err.message);
          throw err;
        }),
        axios.get('http://localhost:3000/api/ohlc', {
          params: { asset, days },
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => {
          console.error('App.js: OHLC fetch error for', asset, ':', err.message);
          throw err;
        }),
        axios.get('http://localhost:3000/api/orderbook', {
          params: { asset },
          headers: { Authorization: `Bearer ${token}` },
        }).catch((err) => {
          console.error('App.js: Order book fetch error for', asset, ':', err.message);
          throw err;
        }),
      ]);

      setPrices(priceResponse.data);
      setOhlcData(ohlcResponse.data);
      setOrderBook(orderBookResponse.data);
      console.log('App.js: Data fetched:', {
        prices: priceResponse.data,
        ohlcDataLength: ohlcResponse.data.length,
        orderBook: orderBookResponse.data,
      });
      setError('');
    } catch (err) {
      console.error('App.js: Error fetching data:', err.message);
      if (err.response?.status === 500) {
        setError('Server error. Please try again later.');
      } else if (err.response?.status === 429) {
        setError('Rate limit exceeded. Please wait and try again.');
      } else {
        setError('Error fetching data. Please try again.');
      }
    }
  }, [user, asset, days]);

  // Fetch data on user or asset/days change
  useEffect(() => {
    if (user) {
      fetchData();
      const interval = setInterval(fetchData, 60000); // Refresh every 60s
      return () => clearInterval(interval);
    }
  }, [user, fetchData]);

  // Debounced asset change handler
  const handleAssetChange = debounce((newAsset) => {
    console.log('App.js: Changing asset to:', newAsset);
    setAsset(newAsset);
  }, 500);

  const handleDaysChange = (newDays) => {
    console.log('App.js: Changing days to:', newDays);
    setDays(newDays);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      await auth.signInWithEmailAndPassword(email, password);
      console.log('App.js: User logged in:', email);
      setError('');
      setSuccess('Login successful!');
    } catch (err) {
      console.error('App.js: Login error:', err.message);
      setError('Login failed: ' + err.message);
      setSuccess('');
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOut();
      console.log('App.js: User signed out');
      setError('');
      setSuccess('Signed out successfully!');
    } catch (err) {
      console.error('App.js: Sign out error:', err.message);
      setError('Sign out failed: ' + err.message);
      setSuccess('');
    }
  };

  const handleKycSubmit = async (e) => {
    e.preventDefault();
    if (!user) {
      setError('Please log in to submit KYC');
      return;
    }
    try {
      const token = await user.getIdToken();
      const response = await axios.post(
        'http://localhost:3000/api/kyc',
        kycData,
        {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        }
      );
      console.log('App.js: KYC submitted successfully:', response.data);
      setSuccess(response.data.message);
      setKycStatus(response.data.status);
      setKycData({ name: '', idNumber: '', address: '', documentType: 'Aadhaar' });
      setError('');
    } catch (err) {
      console.error('App.js: KYC submission error:', err.message);
      setError(err.response?.data?.error || 'KYC submission failed');
      setSuccess('');
    }
  };

  const handleKycInputChange = (e) => {
    const { name, value } = e.target;
    setKycData((prev) => ({ ...prev, [name]: value }));
  };

  const clearCache = async () => {
    try {
      const token = await user.getIdToken();
      await axios.get('http://localhost:3000/api/clear-cache', {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log('App.js: Cache cleared');
      setSuccess('Cache cleared successfully!');
      setError('');
      fetchData();
    } catch (err) {
      console.error('App.js: Clear cache error:', err.message);
      setError('Failed to clear cache: ' + err.message);
      setSuccess('');
    }
  };

  const ChartsTab = () => (
    <div className="charts-tab">
      <Form.Group className="mb-3">
        <Form.Label>Select Asset</Form.Label>
        <Form.Select value={asset} onChange={(e) => handleAssetChange(e.target.value)}>
          <option value="bitcoin">Bitcoin</option>
          <option value="ethereum">Ethereum</option>
          <option value="litecoin">Litecoin</option>
          <option value="ripple">Ripple</option>
          <option value="cardano">Cardano</option>
          <option value="solana">Solana</option>
        </Form.Select>
      </Form.Group>
      <Form.Group className="mb-3">
        <Form.Label>Time Range</Form.Label>
        <Form.Select value={days} onChange={(e) => handleDaysChange(e.target.value)}>
          <option value="7">7 Days</option>
          <option value="14">14 Days</option>
          <option value="30">30 Days</option>
          <option value="90">90 Days</option>
        </Form.Select>
      </Form.Group>
      {ohlcData && ohlcData.length > 0 ? (
        <Chart data={ohlcData} asset={asset} />
      ) : (
        <p>Loading chart...</p>
      )}
    </div>
  );

  const DepthTab = () => (
    <div className="depth-tab">
      {orderBook && orderBook.bids && orderBook.asks ? (
        <DepthChart data={orderBook} asset={asset} />
      ) : (
        <p>Loading depth chart...</p>
      )}
    </div>
  );

  const PricesTab = () => (
    <div className="prices-tab">
      <h3>Market Prices</h3>
      <ul className="price-list">
        {Object.keys(prices).map((coin) => (
          <li key={coin}>
            {coin.toUpperCase()}: ${prices[coin]?.usd || 'N/A'}
          </li>
        ))}
      </ul>
    </div>
  );

  const TradeTab = () => (
    <div className="trade-tab">
      <h3>Trade</h3>
      <Form className="trade-form">
        <Form.Group className="mb-3">
          <Form.Label>Amount</Form.Label>
          <Form.Control type="number" placeholder="Enter amount" />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>Price</Form.Label>
          <Form.Control type="number" placeholder="Enter price" />
        </Form.Group>
        <Button variant="primary" type="submit">
          Place Order
        </Button>
      </Form>
    </div>
  );

  const WalletTab = () => (
    <div className="wallet-tab">
      <h3>Wallet</h3>
      {kycStatus !== 'verified' ? (
        <Form onSubmit={handleKycSubmit} className="kyc-form">
          <Form.Group className="mb-3">
            <Form.Label>Full Name</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={kycData.name}
              onChange={handleKycInputChange}
              placeholder="Enter your full name"
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>ID Number</Form.Label>
            <Form.Control
              type="text"
              name="idNumber"
              value={kycData.idNumber}
              onChange={handleKycInputChange}
              placeholder="Enter ID number (Aadhaar, PAN, etc.)"
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Address</Form.Label>
            <Form.Control
              type="text"
              name="address"
              value={kycData.address}
              onChange={handleKycInputChange}
              placeholder="Enter your address"
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Document Type</Form.Label>
            <Form.Select
              name="documentType"
              value={kycData.documentType}
              onChange={handleKycInputChange}
              required
            >
              <option value="Aadhaar">Aadhaar</option>
              <option value="PAN">PAN</option>
              <option value="Passport">Passport</option>
              <option value="Driver’s License">Driver’s License</option>
            </Form.Select>
          </Form.Group>
          <Button variant="primary" type="submit">
            Submit KYC
          </Button>
          {success && <Alert variant="success" className="mt-3">{success}</Alert>}
          {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
        </Form>
      ) : (
        <div>
          <p>Wallet access granted! KYC Status: {kycStatus}</p>
          <p>Balance: $0.00 (Placeholder)</p>
        </div>
      )}
    </div>
  );

  const AnalyticsTab = () => (
    <div className="analytics-tab">
      <h3>Analytics</h3>
      <PieChart data={prices} />
    </div>
  );

  if (!user) {
    return (
      <Container className="login-prompt">
        <h2>Login to Bidance</h2>
        <Form onSubmit={handleLogin} className="login-form">
          <Form.Group className="mb-3">
            <Form.Label>Email</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter email"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </Form.Group>
          <Button variant="primary" type="submit">
            Login
          </Button>
          {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
          {success && <Alert variant="success" className="mt-3">{success}</Alert>}
        </Form>
      </Container>
    );
  }

  return (
    <div className="app-container">
      <Navbar bg="dark" variant="dark" expand="lg" className="header">
        <Container>
          <Navbar.Brand className="header-logo">Bidance</Navbar.Brand>
          <Nav className="ms-auto header-user">
            <NavDropdown title={user.email} id="user-dropdown">
              <NavDropdown.Item onClick={handleSignOut}>Sign Out</NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </Container>
      </Navbar>
      <Container>
        <Nav
          variant="tabs"
          activeKey={activeTab}
          onSelect={(tab) => setActiveTab(tab)}
          className="nav-tabs"
        >
          <Nav.Item>
            <Nav.Link eventKey="prices">Prices</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="charts">Charts</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="depth">Depth</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="trade">Trade</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="wallet">Wallet</Nav.Link>
          </Nav.Item>
          <Nav.Item>
            <Nav.Link eventKey="analytics">Analytics</Nav.Link>
          </Nav.Item>
        </Nav>
        <div className="tab-content">
          {activeTab === 'prices' && <PricesTab />}
          {activeTab === 'charts' && <ChartsTab />}
          {activeTab === 'depth' && <DepthTab />}
          {activeTab === 'trade' && <TradeTab />}
          {activeTab === 'wallet' && <WalletTab />}
          {activeTab === 'analytics' && <AnalyticsTab />}
        </div>
        <Button variant="secondary" onClick={clearCache} className="mt-3">
          Clear Cache
        </Button>
        {success && <Alert variant="success" className="mt-3">{success}</Alert>}
        {error && <Alert variant="danger" className="mt-3">{error}</Alert>}
      </Container>
    </div>
  );
};

export default App;