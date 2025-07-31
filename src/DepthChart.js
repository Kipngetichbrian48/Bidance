import React, { Component } from 'react';
import { createChart } from 'lightweight-charts'; // eslint-disable-line no-unused-vars

class ErrorBoundary extends Component { // eslint-disable-line no-unused-vars
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

class DepthChart extends Component {
  constructor(props) {
    super(props);
    this.chartContainerRef = React.createRef();
    this.chartInstanceRef = React.createRef(null);
    this.resizeHandler = null;
  }

  componentDidMount() {
    console.log('DepthChart componentDidMount');
    this.renderChart();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.orderBook !== this.props.orderBook || prevProps.isActive !== this.props.isActive) {
      console.log('DepthChart componentDidUpdate triggered:', {
        orderBookChanged: prevProps.orderBook !== this.props.orderBook,
        isActiveChanged: prevProps.isActive !== this.props.isActive,
        isActive: this.props.isActive,
        activeTab: this.props.activeTab,
      });
      this.renderChart();
    }
  }

  componentWillUnmount() {
    console.log('DepthChart componentWillUnmount');
    if (this.chartInstanceRef.current) {
      try {
        this.chartInstanceRef.current.remove();
        console.log('Chart instance removed');
      } catch (error) {
        console.error('Error removing chart instance:', error);
      }
      this.chartInstanceRef.current = null;
    }
    if (this.resizeHandler) {
      window.removeEventListener('resize', this.resizeHandler);
      console.log('Resize handler removed');
    }
  }

  renderChart() {
    const { orderBook, setDepthChartError, isActive, activeTab } = this.props;
    const container = this.chartContainerRef.current;

    console.log('DepthChart renderChart props:', { isActive, activeTab, hasContainer: !!container, hasData: !!orderBook?.bids?.length && !!orderBook?.asks?.length });

    if (!container || !isActive) {
      console.log('Skipping Depth Chart render: Missing container or tab not active', { container: !!container, isActive });
      return;
    }

    if (!orderBook?.bids?.length || !orderBook?.asks?.length) {
      console.log('Skipping Depth Chart render: No valid order book data');
      setDepthChartError('No order book data available');
      return;
    }

    console.log('Rendering Depth Chart with data:', JSON.stringify(orderBook, null, 2));
    console.log('Depth Chart container:', container.outerHTML);

    try {
      const tabPane = container.closest('.tab-pane');
      const isTabActive = tabPane.classList.contains('active') && tabPane.classList.contains('show');
      console.log('Depth Chart tab active:', isTabActive, 'Tab classes:', tabPane.classList.toString());
      console.log('Container computed style:', window.getComputedStyle(container));

      let containerWidth = container.clientWidth;
      const containerHeight = 400;
      console.log('Container dimensions:', { width: containerWidth, height: containerHeight });

      // Fallback width
      if (containerWidth <= 0) {
        console.warn('Container width is 0, using fallback width');
        containerWidth = tabPane.clientWidth || document.querySelector('.tab-content').clientWidth || 800;
        container.style.width = `${containerWidth}px`;
      }

      if (containerWidth <= 0 || containerHeight <= 0 || window.getComputedStyle(container).display === 'none') {
        throw new Error(`Invalid container state: width=${containerWidth}, height=${containerHeight}, display=${window.getComputedStyle(container).display}`);
      }

      // Clear existing chart
      if (this.chartInstanceRef.current) {
        console.log('Removing existing chart instance');
        try {
          this.chartInstanceRef.current.remove();
        } catch (error) {
          console.error('Error removing existing chart:', error);
        }
        this.chartInstanceRef.current = null;
      }

      // Remove existing resize handler
      if (this.resizeHandler) {
        window.removeEventListener('resize', this.resizeHandler);
        console.log('Previous resize handler removed');
      }

      const chart = createChart(container, {
        width: containerWidth,
        height: containerHeight,
        layout: { background: { color: '#1a1a1a' }, textColor: '#ffffff' },
        grid: { vertLines: { color: '#333333' }, horzLines: { color: '#333333' } },
      });
      this.chartInstanceRef.current = chart;
      console.log('Lightweight Charts chart created:', chart);

      // Validate orderBook data
      const validBids = orderBook.bids.filter(
        (order) => typeof order.price === 'string' && !isNaN(parseFloat(order.price)) && typeof order.amount === 'string'
      );
      const validAsks = orderBook.asks.filter(
        (order) => typeof order.price === 'string' && !isNaN(parseFloat(order.price)) && typeof order.amount === 'string'
      );
      if (!validBids.length || !validAsks.length) {
        throw new Error(`Invalid order book data: ${validBids.length} valid bids, ${validAsks.length} valid asks`);
      }

      // Try addAreaSeries, fallback to addLineSeries
      let bidSeries, askSeries;
      if (typeof chart.addAreaSeries === 'function') {
        console.log('Using addAreaSeries for Depth Chart');
        bidSeries = chart.addAreaSeries({
          lineColor: '#00ff00',
          topColor: '#00ff0044',
          bottomColor: '#00ff0000',
        });
        askSeries = chart.addAreaSeries({
          lineColor: '#ff0000',
          topColor: '#ff000044',
          bottomColor: '#ff000000',
        });
      } else if (typeof chart.addLineSeries === 'function') {
        console.warn('Falling back to addLineSeries due to missing addAreaSeries');
        bidSeries = chart.addLineSeries({ color: '#00ff00' });
        askSeries = chart.addLineSeries({ color: '#ff0000' });
        setDepthChartError('Using line chart as fallback due to library issue');
      } else {
        throw new Error('No suitable series method available (addAreaSeries or addLineSeries)');
      }

      // Plot price data
      bidSeries.setData(
        validBids.map((order, index) => ({
          time: index,
          value: parseFloat(order.price),
        }))
      );
      askSeries.setData(
        validAsks.map((order, index) => ({
          time: index,
          value: parseFloat(order.price),
        }))
      );

      chart.timeScale().fitContent();

      // Debounced resize handler
      this.resizeHandler = () => {
        if (this.chartInstanceRef.current && container) {
          const newWidth = container.clientWidth || 800;
          if (newWidth > 0) {
            console.log('Resizing chart to width:', newWidth);
            this.chartInstanceRef.current.resize(newWidth, containerHeight);
            this.chartInstanceRef.current.timeScale().fitContent();
          }
        }
      };
      window.addEventListener('resize', this.resizeHandler);

      // Force canvas visibility
      const canvas = container.querySelector('canvas');
      if (canvas) {
        canvas.style.display = 'block';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.backgroundColor = '#1a1a1a';
        console.log('Canvas styles applied:', canvas.style.cssText);
      } else {
        console.warn('No canvas found in chart container');
      }

      setDepthChartError('');
      console.log('Depth Chart rendered successfully');
    } catch (error) {
      console.error('Depth Chart rendering error:', error);
      setDepthChartError(`Failed to render chart: ${error.message}`);
    }
  }

  render() {
    const { orderBook, depthChartError } = this.props;
    return (
      <ErrorBoundary>
        {depthChartError && <p className="text-danger">{depthChartError}</p>}
        {orderBook.bids.length === 0 || orderBook.asks.length === 0 ? (
          <p>Loading depth chart...</p>
        ) : (
          <>
            <div
              ref={this.chartContainerRef}
              className="chart-container"
              style={{ minHeight: '400px', minWidth: '100%' }}
            />
            {depthChartError && (
              <table className="table table-dark mt-3">
                <thead>
                  <tr>
                    <th>Bid Price (USD)</th>
                    <th>Bid Amount</th>
                    <th>Ask Price (USD)</th>
                    <th>Ask Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {orderBook.bids.slice(0, 5).map((bid, index) => (
                    <tr key={`fallback-${index}`}>
                      <td className="text-success">{bid.price}</td>
                      <td>{bid.amount}</td>
                      <td className="text-danger">{orderBook.asks[index]?.price || 'N/A'}</td>
                      <td>{orderBook.asks[index]?.amount || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </ErrorBoundary>
    );
  }
}

export default DepthChart;