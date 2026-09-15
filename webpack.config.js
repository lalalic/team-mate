const path = require('path');
const webpack = require('webpack');

module.exports = {
    entry: {
        "main": './src/main.js',
        "background": './src/background.js',
        "content": './src/content.js',
        "play": './src/play.js',
        "setup": './src/setup.js',
    },
    output: {
        path: path.resolve(__dirname, 'extension'),
        filename: '[name].js',
    },
    mode: "development",
    plugins: [
        new webpack.DefinePlugin({
            __EXTPAY_EXTENSION_ID__: JSON.stringify(process.env.EXTPAY_EXTENSION_ID || ''),
        }),
    ],
    devtool: "inline-source-map",
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                },
            },
        ],
    }
};
