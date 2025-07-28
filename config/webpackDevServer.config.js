const errorOverlayMiddleware = require('react-dev-utils/errorOverlayMiddleware');
const evalSourceMapMiddleware = require('react-dev-utils/evalSourceMapMiddleware');
const noopServiceWorkerMiddleware = require('react-dev-utils/noopServiceWorkerMiddleware');
const redirectServedPathMiddleware = require('react-dev-utils/redirectServedPathMiddleware');
const paths = require('./paths');

const host = process.env.HOST || '0.0.0.0';
const sockHost = process.env.WDS_SOCKET_HOST;
const sockPath = process.env.WDS_SOCKET_PATH;
const sockPort = process.env.WDS_SOCKET_PORT;

module.exports = function (proxy, allowedHost) {
  return {
    compress: true,
    static: {
      directory: paths.appPublic,
      publicPath: [paths.publicUrlOrPath],
      serveIndex: { icons: true },
      watch: {
        ignored: paths.appNodeModules,
      },
    },
    client: {
      webSocketURL: {
        hostname: sockHost || allowedHost || host,
        pathname: sockPath || '/ws',
        port: sockPort || (process.env.PORT && parseInt(process.env.PORT, 10)) || 3001,
      },
      overlay: false,
      logging: 'none',
    },
    devMiddleware: {
      publicPath: paths.publicUrlOrPath.slice(0, -1),
      writeToDisk: true,
    },
    server: {
      type: 'http',
    },
    host,
    historyApiFallback: {
      disableDotRule: true,
      index: paths.publicUrlOrPath,
    },
    proxy,
    setupMiddlewares: (middlewares, devServer) => {
      if (!devServer) {
        throw new Error('webpack-dev-server is not defined');
      }

      middlewares.push(
        evalSourceMapMiddleware(devServer),
        errorOverlayMiddleware(),
        redirectServedPathMiddleware(),
        noopServiceWorkerMiddleware(paths.publicUrlOrPath)
      );

      return middlewares;
    },
  };
};