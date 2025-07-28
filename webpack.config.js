const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const { EnvironmentPlugin } = require('webpack');
require('dotenv').config(); // Load .env file

module.exports = {
  mode: 'development',
  entry: './src/index.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/',
  },
  devServer: {
    port: 3001,
    hot: true,
    open: true,
    historyApiFallback: true,
    static: {
      directory: path.join(__dirname, 'public'),
    },
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }
      console.log('Setting up Webpack Dev Server middlewares');
      return middlewares;
    },
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-env', '@babel/preset-react'],
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
      favicon: './public/favicon.ico',
    }),
    new EnvironmentPlugin({
      REACT_APP_FIREBASE_API_KEY: null,
      REACT_APP_FIREBASE_AUTH_DOMAIN: null,
      REACT_APP_FIREBASE_PROJECT_ID: null,
      REACT_APP_FIREBASE_STORAGE_BUCKET: null,
      REACT_APP_FIREBASE_MESSAGING_SENDER_ID: null,
      REACT_APP_FIREBASE_APP_ID: null,
      REACT_APP_FIREBASE_MEASUREMENT_ID: null,
      COINGECKO_API_KEY: null,
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx'],
  },
};