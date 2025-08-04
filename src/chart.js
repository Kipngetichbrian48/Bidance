import React, { useEffect, useRef } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import './Chart.css';

const Chart = ({ data, asset }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);

  useEffect(() => {
    if (!chartContainerRef.current || !data || !Array.isArray(data) || data.length === 0) {
      console.log('Chart.js: No data or container, skipping render for', asset);
      return;
    }

    console.log('Chart.js: Initializing chart for', asset, 'with', data.length, 'data points');

    // Validate and normalize data
    const validData = data
      .map(item => {
        if (!Array.isArray(item) || item.length < 5) {
          console.warn('Chart.js: Invalid item format:', item);
          return null;
        }
        return {
          time: Math.floor(item[0] / 1000), // Convert ms to seconds
          open: parseFloat(item[1]),
          high: parseFloat(item[2]),
          low: parseFloat(item[3]),
          close: parseFloat(item[4]),
        };
      })
      .filter(
        item =>
          item &&
          Number.isFinite(item.time) &&
          Number.isFinite(item.open) &&
          Number.isFinite(item.high) &&
          Number.isFinite(item.low) &&
          Number.isFinite(item.close)
      )
      .sort((a, b) => a.time - b.time); // Ensure ascending order

    if (validData.length === 0) {
      console.warn('Chart.js: No valid data after filtering for', asset, data);
      return;
    }

    // Calculate price range for dynamic scaling
    const prices = validData.flatMap(d => [d.open, d.high, d.low, d.close]);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    const isLowPriceAsset = maxPrice < 10; // e.g., Cardano, Ripple

    // Destroy existing chart
    if (chartRef.current) {
      console.log('Chart.js: Removing existing chart for', asset);
      chartRef.current.remove();
      chartRef.current = null;
      seriesRef.current = null;
    }

    // Create new chart
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth || 800, // Fallback width
      height: window.innerWidth <= 768 ? 300 : 400, // Mobile responsiveness
      layout: {
        background: { type: ColorType.Solid, color: '#1a1a1a' },
        textColor: '#d1d4dc',
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      },
      grid: {
        vertLines: { color: '#333333' },
        horzLines: { color: '#333333' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: '#333333',
        minBarSpacing: 0.5, // Adjust candle spacing
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      rightPriceScale: {
        borderColor: '#333333',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        mode: isLowPriceAsset ? 0 : 1, // Linear for low prices, logarithmic for high
        autoScale: true,
        minimumHeight: priceRange < 1 ? 0.01 : undefined, // Ensure visibility for small ranges
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Add candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#00ff00',
      downColor: '#ff0000',
      borderVisible: false,
      wickUpColor: '#00ff00',
      wickDownColor: '#ff0000',
    });
    seriesRef.current = candlestickSeries;

    // Set data
    candlestickSeries.setData(validData);
    console.log('Chart.js: Set candlestick data for', asset, validData.slice(0, 2));

    // Auto-fit the chart
    chart.timeScale().fitContent();

    // Handle resize
    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        const width = chartContainerRef.current.clientWidth || 800;
        chartRef.current.resize(width, window.innerWidth <= 768 ? 300 : 400);
        console.log('Chart.js: Resized to width:', width);
      }
    };
    window.addEventListener('resize', handleResize);

    // Debug styles
    console.log('Chart.js: Container styles:', {
      backgroundColor: getComputedStyle(chartContainerRef.current).backgroundColor,
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });

    // Cleanup
    return () => {
      console.log('Chart.js: Cleaning up chart for', asset);
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        seriesRef.current = null;
      }
    };
  }, [data, asset]);

  return <div ref={chartContainerRef} className="chart-container" />;
};

export default Chart;