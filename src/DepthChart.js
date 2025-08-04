import React, { useEffect, useRef } from 'react';
import { createChart } from 'lightweight-charts';

const DepthChart = ({ data, asset }) => {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const bidsSeriesRef = useRef(null);
  const asksSeriesRef = useRef(null);

  useEffect(() => {
    console.log('DepthChart.js: Received data for', asset, ':', data);
    if (!chartContainerRef.current || !data || !Array.isArray(data.bids) || !Array.isArray(data.asks)) {
      console.log('DepthChart.js: Missing container or invalid data:', {
        bids: Array.isArray(data?.bids),
        asks: Array.isArray(data?.asks),
      });
      return;
    }

    try {
      console.log('DepthChart.js: Initializing chart with', data.bids.length, 'bids,', data.asks.length, 'asks');
      // Clean up existing chart
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        bidsSeriesRef.current = null;
        asksSeriesRef.current = null;
        console.log('DepthChart.js: Previous chart cleaned up');
      }

      chartRef.current = createChart(chartContainerRef.current, {
        width: chartContainerRef.current.clientWidth || 600,
        height: 400,
        layout: {
          background: { type: 'solid', color: '#1a1a1a' },
          textColor: '#ffffff',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        },
        grid: {
          vertLines: { color: '#333333' },
          horzLines: { color: '#333333' },
        },
        rightPriceScale: {
          borderColor: '#333333',
          autoScale: true,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          borderColor: '#333333',
          fixLeftEdge: false,
          fixRightEdge: false,
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

      bidsSeriesRef.current = chartRef.current.addAreaSeries({
        topColor: 'rgba(0, 255, 0, 0.3)',
        bottomColor: 'rgba(0, 255, 0, 0.04)',
        lineColor: '#00ff00',
        lineWidth: 2,
      });

      asksSeriesRef.current = chartRef.current.addAreaSeries({
        topColor: 'rgba(255, 0, 0, 0.3)',
        bottomColor: 'rgba(255, 0, 0, 0.04)',
        lineColor: '#ff0000',
        lineWidth: 2,
      });

      // Client-side sorting with precision handling
      const bidsData = data.bids
        .map(([price, amount]) => ({
          time: Number(parseFloat(price).toFixed(8)),
          value: parseFloat(amount),
        }))
        .filter(item => Number.isFinite(item.time) && Number.isFinite(item.value))
        .sort((a, b) => a.time - b.time); // Ascending for bids

      const asksData = data.asks
        .map(([price, amount]) => ({
          time: Number(parseFloat(price).toFixed(8)),
          value: parseFloat(amount),
        }))
        .filter(item => Number.isFinite(item.time) && Number.isFinite(item.value))
        .sort((a, b) => a.time - b.time); // Ascending for asks

      if (bidsData.length === 0 || asksData.length === 0) {
        console.log('DepthChart.js: No valid data after filtering:', { bidsData, asksData });
        return;
      }

      bidsSeriesRef.current.setData(bidsData);
      asksSeriesRef.current.setData(asksData);
      console.log('DepthChart.js: Depth chart rendered successfully:', {
        bidsSample: bidsData.slice(0, 2),
        asksSample: asksData.slice(0, 2),
      });

      const handleResize = () => {
        if (chartRef.current && chartContainerRef.current) {
          const width = chartContainerRef.current.clientWidth || 600;
          chartRef.current.resize(width, 400);
          console.log('DepthChart.js: Resized to width:', width);
        }
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          bidsSeriesRef.current = null;
          asksSeriesRef.current = null;
          console.log('DepthChart.js: Depth chart cleaned up');
        }
      };
    } catch (error) {
      console.error('DepthChart.js: Depth Chart rendering error:', error);
    }
  }, [data, asset]); // Add asset to dependencies

  return (
    <div
      ref={chartContainerRef}
      className="depth-chart-container"
      style={{ width: '100%', height: '400px', backgroundColor: '#1a1a1a' }}
    />
  );
};

export default DepthChart;