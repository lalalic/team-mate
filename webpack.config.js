const path = require('path');

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
