const path = require('path');
const webpack = require('webpack');

// Plugins
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const CreateFileWebpack = require('create-file-webpack');

// PostCSS
const autoprefixer = require('autoprefixer');
const postcssVars = require('postcss-simple-vars');
const postcssImport = require('postcss-import');

// 環境変数の設定
const STATIC_PATH = process.env.STATIC_PATH || '/static';
const isProduction = process.env.NODE_ENV === 'production';
const isDistMode = process.env.BUILD_MODE === 'dist';

const baseConfig = {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? 'source-map' : 'cheap-module-source-map',
    output: {
        library: 'GUI',
        filename: '[name].js',
        chunkFilename: 'chunks/[name].js',
        publicPath: 'auto',
        assetModuleFilename: 'static/assets/[name].[hash][ext][query]'
    },
    resolve: {
        symlinks: false,
        fallback: {
            Buffer: require.resolve('buffer/'),
            stream: require.resolve('stream-browserify')
        }
    },
    module: {
        rules: [
            {
                test: /\.jsx?$/,
                loader: 'babel-loader',
                include: [
                    path.resolve(__dirname, 'src'),
                    /node_modules[\\/]scratch-[^\\/]+[\\/]src/,
                    /node_modules[\\/]pify/,
                    /node_modules[\\/]@vernier[\\/]godirect/
                ],
                options: {
                    babelrc: false,
                    plugins: [
                        '@babel/plugin-syntax-dynamic-import',
                        '@babel/plugin-transform-async-to-generator',
                        '@babel/plugin-proposal-object-rest-spread',
                        ['react-intl', { messagesDir: './translations/messages/' }]
                    ],
                    presets: ['@babel/preset-env', '@babel/preset-react']
                }
            },
            {
                test: /\.css$/,
                use: [
                    'style-loader',
                    {
                        loader: 'css-loader',
                        options: {
                            modules: true,
                            importLoaders: 1,
                            localIdentName: '[name]_[local]_[hash:base64:5]',
                            camelCase: true
                        }
                    },
                    {
                        loader: 'postcss-loader',
                        options: {
                            ident: 'postcss',
                            plugins: () => [postcssImport, postcssVars, autoprefixer]
                        }
                    }
                ]
            },
            {
                test: /\.(svg|png|wav|mp3|gif|jpg)$/,
                type: 'asset'
            }
        ]
    },
    plugins: [
        new webpack.ProgressPlugin(),
        new webpack.DefinePlugin({
            'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
            'process.env.DEBUG': Boolean(process.env.DEBUG),
            'process.env.GA_ID': JSON.stringify(process.env.GA_ID || 'UA-000000-01'),
            'process.env.GTM_ID': JSON.stringify(process.env.GTM_ID || ''),
            'process.env.GTM_ENV_AUTH': JSON.stringify(process.env.GTM_ENV_AUTH || '')
        }),
        new CopyWebpackPlugin({
            patterns: [
                { from: 'static', to: 'static' },
                { from: 'node_modules/scratch-blocks/media', to: 'static/blocks-media' },
                { from: 'extension-worker.{js,js.map}', context: 'node_modules/scratch-vm/dist/web' }
            ]
        }),
        new CreateFileWebpack({
            path: path.resolve(__dirname, 'build'),
            fileName: 'version.txt',
            content: new Date().toISOString()
        })
    ],
    optimization: {
        splitChunks: { chunks: 'all', name: 'lib.min' },
        runtimeChunk: { name: 'runtime' },
        minimizer: [
            new UglifyJsPlugin({ include: /\.min\.js$/ })
        ]
    },
    devServer: {
        contentBase: path.resolve(__dirname, 'build'),
        host: '0.0.0.0',
        port: process.env.PORT || 8601
    }
};

// 開発用ビルド設定
const buildConfig = {
    ...baseConfig,
    entry: {
        gui: './src/playground/index.jsx',
        blocksonly: './src/playground/blocks-only.jsx',
        compatibilitytesting: './src/playground/compatibility-testing.jsx',
        player: './src/playground/player.jsx'
    },
    output: { path: path.resolve(__dirname, 'build') },
    plugins: [
        ...baseConfig.plugins,
        new HtmlWebpackPlugin({
            chunks: ['gui'],
            template: 'src/playground/index.ejs',
            title: 'GUI Editor'
        }),
        new HtmlWebpackPlugin({
            chunks: ['blocksonly'],
            filename: 'blocks-only.html',
            template: 'src/playground/index.ejs',
            title: 'Blocks Only'
        }),
        new HtmlWebpackPlugin({
            chunks: ['compatibilitytesting'],
            filename: 'compatibility-testing.html',
            template: 'src/playground/index.ejs',
            title: 'Compatibility Testing'
        }),
        new HtmlWebpackPlugin({
            chunks: ['player'],
            filename: 'player.html',
            template: 'src/playground/index.ejs',
            title: 'Player'
        })
    ]
};

// 配布用ビルド設定
const distConfig = {
    ...baseConfig,
    entry: { 'scratch-gui': './src/index.js' },
    output: {
        path: path.resolve(__dirname, 'dist'),
        libraryTarget: 'umd'
    },
    externals: { react: 'react', 'react-dom': 'react-dom' },
    plugins: [
        ...baseConfig.plugins,
        new CopyWebpackPlugin({
            patterns: [
                { from: 'src/lib/libraries/*.json', to: 'libraries', flatten: true }
            ]
        })
    ]
};

// 実行環境に応じた設定をエクスポート
module.exports = isDistMode || isProduction ? [buildConfig, distConfig] : buildConfig;
