import React, { useState, useEffect, useCallback } from 'react';
import { auth } from './firebase';
import axios from 'axios';
import { Container, Nav, Navbar, NavDropdown, Form, Button, Alert } from 'react-bootstrap';
import Chart from './chart';
import DepthChart from './DepthChart';
import PieChart from './PieChart';
import './App.css';

const App = () => {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('prices');
  const [prices, setPrices] = useState({});
  const [asset, setAsset] = useState('bitcoin');
  const [days, setDays] = useState('7');
  const [ohlcData, setOhlcData] = useState([]);
  const [orderBook, setOrderBook] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [kycData, setKycData] = useState({ name: '', idNumber: '' });
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const fetchData = useCallback(async () => {
    try {
      console.log('App.js: Fetching prices from /api/price');
      const priceResponse = await axios.get('http://localhost:3000/api/price', {
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      });
      console.log('App.js: Prices fetched:', priceResponse.data);
      setPrices(priceResponse.data);

      console.log('App.js: Fetching order book for', asset);
      const orderBookResponse = await axios.get('http://localhost:3000/api/orderbook', {
        params: { asset },
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      });
      console.log('App.js: Order book fetched:', orderBookResponse.data);
      setOrderBook(orderBookResponse.data);

      console.log('App.js: Fetching OHLC data for', asset, `(${days} days)`);
      const ohlcResponse = await axios.get('http://localhost:3000/api/ohlc', {
        params: { asset, days },
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
      });
      console.log('App.js: OHLC data fetched:', ohlcResponse.data.length, 'entries');
      setOhlcData(ohlcResponse.data);
    } catch (err) {
      console.error('App.js: Error fetching data:', err.message);
      if (err.response?.status === 500) {
        if (err.config.url.includes('/api/price')) {
          console.error('App.js: Error fetching prices: Request failed with status code 500');
          setError('Failed to fetch prices. Please try again.');
        } else if (err.config.url.includes('/api/orderbook')) {
          console.error('App.js: Order book fetch error: Request failed with status code 500');
          setError('Failed to fetch order book. Please try again.');
        } else if (err.config.url.includes('/api/ohlc')) {
          console.error('App.js: Error fetching OHLC data for', asset, ': Request failed with status code 500');
          setError('Failed to fetch chart data. Please try again.');
        }
      } else {
        setError('Error fetching data. Please try again.');
      }
    }
  }, [asset, days]); // Dependencies for fetchData

  useEffect(() => {
    console.log('App.js: Checking auth state');
    const unsubscribe = auth.onAuthStateChanged(user => {
      console.log('App.js: Auth state changed:', user ? user.email : null);
      if (user) {
        setUser(user);
        console.log('App.js: User authenticated, fetching data');
        fetchData();
      } else {
        setUser(null);
        setPrices({});
        setOhlcData([]);
        setOrderBook(null);
      }
    });

    return () => {
      console.log('App.js: Cleaning up auth subscription');
      unsubscribe();
    };
  }, [fetchData]); // Add fetchData to dependency array

  const handleLogin = async e => {
    e.preventDefault();
    try {
      await auth.signInWithEmailAndPassword(email, password);
      console.log('App.js: User logged in:', email);
      setError('');
      setSuccess('Login successful!');
      fetchData();
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

  const handleKycSubmit = async e => {
    e.preventDefault();
    try {
      await axios.post(
        'http://localhost:3000/api/kyc',
        kycData,
        {
          headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
        }
      );
      console.log('App.js: KYC submitted successfully:', kycData);
      setSuccess('KYC submitted successfully!');
      setError('');
      setKycData({ name: '', idNumber: '' });
    } catch (err) {
      console.error('App.js: KYC submission error:', err.message);
      setError('KYC submission failed: ' + err.message);
      setSuccess('');
    }
  };

  const handleTabChange = tab => {
    console.log('App.js: Switching to tab:', tab);
    setActiveTab(tab);
  };

  const handleAssetChange = newAsset => {
    console.log('App.js: Changing asset to:', newAsset);
    setAsset(newAsset);
    // fetchData is called via useEffect dependency on asset
  };

  const handleDaysChange = newDays => {
    console.log('App.js: Changing days to:', newDays);
    setDays(newDays);
    // fetchData is called via useEffect dependency on days
  };

  const clearCache = async () => {
    try {
      await axios.get('http://localhost:3000/api/clear-cache', {
        headers: { Authorization: `Bearer ${await auth.currentUser.getIdToken()}` },
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
        {Object.keys(prices).map(coin => (
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
      <Form onSubmit={handleKycSubmit} className="login-form">
        <Form.Group className="mb-3">
          <Form.Label>Name</Form.Label>
          <Form.Control
            type="text"
            value={kycData.name}
            onChange={e => setKycData({ ...kycData, name: e.target.value })}
            placeholder="Enter your name"
          />
        </Form.Group>
        <Form.Group className="mb-3">
          <Form.Label>ID Number</Form.Label>
          <Form.Control
            type="text"
            value={kycData.idNumber}
            onChange={e => setKycData({ ...kycData, idNumber: e.target.value })}
            placeholder="Enter ID number"
          />
        </Form.Group>
        <Button variant="primary" type="submit">
          Submit KYC
        </Button>
      </Form>
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="danger">{error}</Alert>}
    </div>
  );

  const AnalyticsTab = () => (
    <div className="analytics-tab">
      <h3>Analytics</h3>
      <PieChart data={prices} />
    </div>
  );

  console.log('App.js: Rendering with state:', {
    user: !!user,
    activeTab,
    prices,
    ohlcDataLength: ohlcData.length,
    orderBook,
    asset,
    days,
  });

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
              onChange={e => setEmail(e.target.value)}
              placeholder="Enter email"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>Password</Form.Label>
            <Form.Control
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter password"
            />
          </Form.Group>
          <Button variant="primary" type="submit">
            Login
          </Button>
        </Form>
        {error && <Alert variant="danger">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}
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
          onSelect={handleTabChange}
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