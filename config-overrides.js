const { override } = require('customize-cra');

module.exports = override(
 (config) => {
 config.devServer = config.devServer || {};

 config.devServer.onBeforeSetupMiddleware = (devServer) => {
 if (!devServer) {
 throw new Error('webpack-dev-server is not defined');
 }
 console.log('Setting up Webpack Dev Server before middlewares');
 };

 config.devServer.onAfterSetupMiddleware = (devServer) => {
 console.log('Setting up Webpack Dev Server after middlewares');
 };

 return config;
 }
);