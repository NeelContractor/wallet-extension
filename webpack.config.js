const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const webpack = require('webpack');

module.exports = {
    mode: 'production',
    entry: {
        popup: './src/popup.js',
        background: './src/background.js',
        content: './src/content.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js',
        clean: true
    },
    module: {
        rules: [
            {
              test: /\.js$/,
              exclude: /node_modules/,
              type: "javascript/auto",
              use: {
                loader: "babel-loader",
                options: {
                  sourceType: "unambiguous",
                  presets: [
                    [
                      "@babel/preset-env",
                      {
                        modules: false
                      }
                    ]
                  ]
                }
              }
            }
        ]
    },
    resolve: {
        fallback: {
            "crypto": false,
            "stream": require.resolve("stream-browserify"),
            "buffer": require.resolve("buffer/"),
            "process": require.resolve("process/browser")
        }
    },
    plugins: [
        new webpack.ProvidePlugin({
            Buffer: ['buffer', 'Buffer'],
            process: 'process/browser'
        }),
        new CopyPlugin({
            patterns: [
                { from: 'src/popup.html', to: 'popup.html' },
                { from: 'src/popup.css', to: 'popup.css' },
                { from: 'src/manifest.json', to: 'manifest.json' },
                { from: 'icons', to: 'icons', noErrorOnMissing: true }
            ],
        }),
    ],
    performance: {
        maxAssetSize: 5000000,
        maxEntrypointSize: 5000000
    }
};