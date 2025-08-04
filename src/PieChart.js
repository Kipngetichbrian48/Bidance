import React from 'react';
import { Pie } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const PieChart = ({ data }) => {
  console.log('PieChart rendering with data:', data);
  if (!data || Object.keys(data).length === 0) {
    return <div>No price data available</div>;
  }

  const chartData = {
    labels: Object.keys(data),
    datasets: [
      {
        data: Object.values(data).map((value) => value.usd),
        backgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
        ],
        hoverBackgroundColor: [
          '#FF6384',
          '#36A2EB',
          '#FFCE56',
          '#4BC0C0',
          '#9966FF',
          '#FF9F40',
        ],
      },
    ],
  };

  const options = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: (context) => `${context.label}: $${context.raw.toLocaleString()}`,
        },
      },
    },
  };

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto' }}>
      <Pie data={chartData} options={options} />
    </div>
  );
};

export default PieChart;