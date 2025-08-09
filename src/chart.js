// File: src/Chart.js
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
    console.log('Chart.js: Raw data sample for', asset, data.slice(0, 5)); // Log first 5 points

    // Validate and normalize data
    const validData = data
      .map((item, index) => {
        if (!Array.isArray(item) || item.length < 5) {
          console.warn(`Chart.js: Invalid item format at index ${index} for ${asset}:`, item);
          return null;
        }

        const time = Number(item[0]);
        const open = parseFloat(String(item[1]).trim());
        const high = parseFloat(String(item[2]).trim());
        const low = parseFloat(String(item[3]).trim());
        const close = parseFloat(String(item[4]).trim());

        if (
          !Number.isFinite(time) ||
          !Number.isFinite(open) ||
          !Number.isFinite(high) ||
          !Number.isFinite(low) ||
          !Number.isFinite(close)
        ) {
          console.warn(`Chart.js: Invalid data point at index ${index} for ${asset}:`, {
            time,
            open,
            high,
            low,
            close,
            raw: item,
          });
          return null;
        }

        return {
          time: Math.floor(time / 1000), // Convert ms to seconds
          open,
          high,
          low,
          close,
        };
      })
      .filter(item => item !== null);

    console.log('Chart.js: Pre-sort valid data length for', asset, validData.length);

    // Sort and handle duplicates by keeping the latest entry
    const uniqueValidData = validData.reduce((acc, current) => {
      const existingIndex = acc.findIndex(item => item.time === current.time);
      if (existingIndex === -1) {
        acc.push(current);
      } else {
        console.warn(`Chart.js: Duplicate timestamp ${current.time} for ${asset}, replacing with latest`, {
          old: acc[existingIndex],
          new: current,
        });
        acc[existingIndex] = current;
      }
      return acc;
    }, []);

    uniqueValidData.sort((a, b) => a.time - b.time);
    console.log('Chart.js: Post-sort unique valid data length for', asset, uniqueValidData.length);

    if (uniqueValidData.length === 0) {
      console.warn('Chart.js: No valid data after filtering for', asset, data);
      const fallbackData = [
        { time: Math.floor(Date.now() / 1000) - 86400, open: 100, high: 110, low: 90, close: 105 },
        { time: Math.floor(Date.now() / 1000), open: 105, high: 115, low: 95, close: 110 },
      ];
      console.log('Chart.js: Using fallback data for', asset);
      uniqueValidData.push(...fallbackData);
    }

    console.log('Chart.js: Processed candlestick data for', asset, uniqueValidData.slice(0, 5));

    // Calculate price range for dynamic scaling
    const prices = uniqueValidData.flatMap(d => [d.open, d.high, d.low, d.close]);
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
      width: chartContainerRef.current.clientWidth || 800,
      height: window.innerWidth <= 768 ? 300 : 400,
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
        minBarSpacing: 0.5,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      rightPriceScale: {
        borderColor: '#333333',
        scaleMargins: { top: 0.1, bottom: 0.1 },
        mode: isLowPriceAsset ? 0 : 1,
        autoScale: true,
        minimumHeight: priceRange < 1 ? 0.01 : undefined,
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
    candlestickSeries.setData(uniqueValidData);
    console.log('Chart.js: Set candlestick data for', asset, uniqueValidData.slice(0, 2));

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