require('dotenv').config();
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');
const crypto = require('crypto');

// 从环境变量读取配置，如果没有则使用默认值
const OKX_CONFIG = {
    apiKey: process.env.OKX_API_KEY,
    secretKey: process.env.OKX_API_SECRET,
    apiPassphrase: process.env.OKX_API_PASSPHRASE,
    chainIndex: '501' // XLayer链
};

// Proxy配置
const PROXY_CONFIG = {
    USE_PROXY: process.env.USE_PROXY === 'true',
    PROXY_URL: process.env.PROXY_URL || 'socks5://127.0.0.1:10808',
    PROXY_TYPE: process.env.PROXY_TYPE || 'socks5'
};

// 创建代理agent
function createProxyAgent() {
    if (!PROXY_CONFIG.USE_PROXY) {
        return null;
    }

    try {
        let agent;
        if (PROXY_CONFIG.PROXY_TYPE === 'socks5') {
            agent = new SocksProxyAgent(PROXY_CONFIG.PROXY_URL);
        } else {
            // http/https代理
            agent = new HttpsProxyAgent(PROXY_CONFIG.PROXY_URL);
        }
        return agent;
    } catch (error) {
        console.error('\n❌ 创建代理失败:');
        console.error(`错误类型: ${error.constructor.name}`);
        console.error(`错误消息: ${error.message}`);
        return null;
    }
}

// 生成API签名
function createSignature(method, requestPath, body = '') {
    const timestamp = new Date().toISOString();
    const message = timestamp + method + requestPath + body;
    const signature = crypto.createHmac('sha256', OKX_CONFIG.secretKey)
        .update(message)
        .digest('base64');
    return { signature, timestamp };
}

// 获取地址的所有代币余额（新API接口，支持分页）
async function getAddressTokenBalances(address, retryCount = 0) {
    const maxRetries = 3;
    const allTokens = [];
    let currentPage = 1;
    let hasMorePages = true;

    try {
        while (hasMorePages) {
            const timestamp = new Date().toISOString();
            const method = 'GET';
            const requestPath = `/api/v5/xlayer/address/token-balance?chainShortName=XLAYER&address=${address}&protocolType=token_20&limit=100&page=${currentPage}`;

            const signature = crypto.createHmac('sha256', OKX_CONFIG.secretKey)
                .update(timestamp + method + requestPath)
                .digest('base64');

            const response = await fetch(`https://web3.okx.com${requestPath}`, {
                method: method,
                headers: {
                    'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
                    'OK-ACCESS-TIMESTAMP': timestamp,
                    'OK-ACCESS-PASSPHRASE': OKX_CONFIG.apiPassphrase,
                    'OK-ACCESS-SIGN': signature,
                    'Content-Type': 'application/json'
                },
                agent: createProxyAgent()
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.code !== '0') {
                throw new Error(`OKX API错误 [${result.code}]: ${result.msg || '未知错误'}`);
            }

            // 处理分页数据
            if (result.data && result.data.length > 0) {
                const pageData = result.data[0];
                const tokenList = pageData.tokenList || [];

                // 添加当前页的代币到总列表
                allTokens.push(...tokenList);

                // 检查是否还有更多页面
                const totalPage = parseInt(pageData.totalPage || 1);
                const currentPageNum = parseInt(pageData.page || 1);

                console.log(`📄 地址 ${address} 第 ${currentPageNum}/${totalPage} 页: ${tokenList.length} 种代币`);

                if (currentPageNum >= totalPage) {
                    hasMorePages = false;
                } else {
                    currentPage++;
                    // API限流，避免请求过快
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            } else {
                console.warn(`⚠️ 地址 ${address} 第 ${currentPage} 页无数据`);
                hasMorePages = false;
            }
        }

        console.log(`✅ 地址 ${address} 共获取到 ${allTokens.length} 种代币`);
        return allTokens;

    } catch (error) {
        console.error(`❌ 获取地址 ${address} 代币余额失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

        if (retryCount < maxRetries) {
            console.log(`⏳ 等待1.5秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 1500));
            return getAddressTokenBalances(address, retryCount + 1);
        }

        console.error(`❌ 地址 ${address} 达到最大重试次数，放弃获取`);
        return null; // 使用null表示失败，而不是空数组
    }
}

// 获取特定代币的余额（从所有代币余额中筛选）
function getSpecificTokenBalance(tokenBalances, tokenContractAddress) {
    const tokenBalance = tokenBalances.find(token =>
        token.tokenContractAddress &&
        token.tokenContractAddress.toLowerCase() === tokenContractAddress.toLowerCase()
    );

    if (tokenBalance) {
        return {
            balance: parseFloat(tokenBalance.holdingAmount || 0),
            rawBalance: tokenBalance.holdingAmount || '0',
            symbol: tokenBalance.symbol || 'UNKNOWN',
            contractAddress: tokenBalance.tokenContractAddress
        };
    }

    return { balance: 0, rawBalance: '0', symbol: 'UNKNOWN', contractAddress: tokenContractAddress };
}

// 兼容性函数：获取单个ERC20代币余额
async function getTokenBalance(address, tokenContractAddress, retryCount = 0) {
    const allBalances = await getAddressTokenBalances(address, retryCount);
    return getSpecificTokenBalance(allBalances, tokenContractAddress);
}

// 获取池子中DOG代币的准确余额
async function getPoolDOGBalance(poolAddress, dogContractAddress) {
    console.log(`正在查询池子 ${poolAddress} 中的DOG代币余额...`);

    const balanceData = await getTokenBalance(poolAddress, dogContractAddress);

    if (balanceData.error) {
        console.error(`查询池子DOG余额失败: ${balanceData.error}`);
        return null;
    }

    console.log(`✅ 池子DOG代币余额: ${balanceData.balance.toLocaleString()} DOG`);
    return balanceData;
}

// 查询池子合约的储备量（Uniswap V2风格）
async function getPoolReserves(poolAddress) {
    console.log(`正在查询池子 ${poolAddress} 的储备量...`);

    try {
        const { signature, timestamp } = createSignature('POST', '/api/v6/dex/contract/call', '');

        const requestBody = {
            chainIndex: OKX_CONFIG.chainIndex,
            to: poolAddress,
            data: '0x0902f1ac', // getReserves() 函数签名
            value: '0x0'
        };

        const response = await fetch('https://web3.okx.com/api/v6/dex/contract/call', {
            method: 'POST',
            headers: {
                'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': OKX_CONFIG.apiPassphrase,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            agent: createProxyAgent()
        });

        const result = await response.json();

        if (result.code !== '0') {
            console.error(`查询池子储备量失败: ${result.msg || '未知错误'}`);
            return null;
        }

        if (result.data && result.data.length > 0) {
            // 解析getReserves()返回值
            // 返回格式通常是: uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast
            const data = result.data[0];
            // 这里需要根据实际的返回值格式来解析
            console.log(`✅ 池子储备量查询成功:`, data);
            return data;
        }

        return null;

    } catch (error) {
        console.error(`查询池子储备量失败:`, error.message);
        return null;
    }
}

// 计算用户在池子中的实际DOG持有量（使用新API）
async function calculateUserPoolDOGHoldings(userAddress, poolAddress, lpTokenAddress, dogContractAddress) {
    try {
        console.log(`正在计算地址 ${userAddress} 在池子中的DOG持有量...`);

        // 1. 获取用户地址的所有代币余额
        const userTokenBalances = await getAddressTokenBalances(userAddress);
        if (userTokenBalances.length === 0) {
            console.log(`地址 ${userAddress} 没有代币持有量`);
            return { dogHoldings: 0, lpBalance: 0 };
        }

        // 2. 从用户代币余额中提取LP代币数量
        const lpBalanceData = getSpecificTokenBalance(userTokenBalances, lpTokenAddress);
        if (lpBalanceData.balance === 0) {
            console.log(`地址 ${userAddress} 没有LP代币持有量`);
            return { dogHoldings: 0, lpBalance: 0 };
        }

        console.log(`LP代币余额: ${lpBalanceData.balance}`);

        // 3. 查询LP代币的最大流通量
        const lpTokenInfo = await getLPTokenMaxSupply(lpTokenAddress);
        if (!lpTokenInfo || lpTokenInfo.maxSupply === 0) {
            console.error(`无法获取LP代币最大流通量`);
            return { dogHoldings: 0, lpBalance: lpBalanceData.balance };
        }

        console.log(`LP代币最大流通量: ${lpTokenInfo.maxSupply}`);

        // 4. 获取池子地址的所有代币余额
        const poolTokenBalances = await getAddressTokenBalances(poolAddress);
        if (poolTokenBalances.length === 0) {
            console.error(`无法获取池子代币余额`);
            return { dogHoldings: 0, lpBalance: lpBalanceData.balance };
        }

        // 5. 从池子代币余额中提取DOG数量
        const poolDOGBalance = getSpecificTokenBalance(poolTokenBalances, dogContractAddress);
        if (poolDOGBalance.balance === 0) {
            console.error(`池子中没有DOG余额`);
            return { dogHoldings: 0, lpBalance: lpBalanceData.balance };
        }

        console.log(`池子DOG储备量: ${poolDOGBalance.balance}`);

        // 6. 计算用户在池子中的DOG份额
        const userShare = lpBalanceData.balance / lpTokenInfo.maxSupply;
        const userDOGHoldings = userShare * poolDOGBalance.balance;

        console.log(`用户份额: ${(userShare * 100).toFixed(6)}%`);
        console.log(`用户在池子中的DOG持有量: ${userDOGHoldings.toFixed(6)}`);

        return {
            dogHoldings: userDOGHoldings,
            lpBalance: lpBalanceData.balance,
            userShare: userShare,
            poolDOGReserve: poolDOGBalance.balance,
            totalLPSupply: lpTokenInfo.maxSupply,
            lpSymbol: lpTokenInfo.symbol,
            decimals: lpTokenInfo.decimals
        };

    } catch (error) {
        console.error(`计算用户池子DOG持有量失败:`, error.message);
        return { dogHoldings: 0, lpBalance: 0 };
    }
}

// 查询LP代币的最大流通量（使用token-list接口）
async function getLPTokenMaxSupply(lpTokenContractAddress, retryCount = 0) {
    const maxRetries = 3;

    try {
        const timestamp = new Date().toISOString();
        const method = 'GET';
        const requestPath = `/api/v5/xlayer/token/token-list?chainShortName=XLAYER&tokenContractAddress=${lpTokenContractAddress}`;

        const signature = crypto.createHmac('sha256', OKX_CONFIG.secretKey)
            .update(timestamp + method + requestPath)
            .digest('base64');

        const response = await fetch(`https://web3.okx.com${requestPath}`, {
            method: method,
            headers: {
                'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': OKX_CONFIG.apiPassphrase,
                'OK-ACCESS-SIGN': signature,
                'Content-Type': 'application/json'
            },
            agent: createProxyAgent()
        });

        const result = await response.json();

        if (result.code !== '0') {
            throw new Error(`OKX API错误: ${result.msg || '未知错误'}`);
        }

        if (result.data && result.data.length > 0) {
            const tokenList = result.data[0].tokenList;
            if (tokenList && tokenList.length > 0) {
                const tokenInfo = tokenList[0];

                // 使用totalSupply作为最大流通量
                const maxSupply = parseFloat(tokenInfo.totalSupply || 0);
                return {
                    maxSupply: maxSupply,
                    symbol: tokenInfo.token || 'LP',
                    decimals: parseInt(tokenInfo.precision || 18)
                };
            }
        }

        return { maxSupply: 0, symbol: 'LP', decimals: 18 };

    } catch (error) {
        console.error(`获取LP代币最大流通量失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

        if (retryCount < maxRetries) {
            // 等待1.5秒后重试
            await new Promise(resolve => setTimeout(resolve, 1500));
            return getLPTokenMaxSupply(lpTokenContractAddress, retryCount + 1);
        }

        // 达到最大重试次数，返回失败结果
        return { maxSupply: 0, symbol: 'LP', decimals: 18, error: error.message };
    }
}

// 查询代币总供应量（兼容旧接口）
async function getTokenTotalSupply(tokenContractAddress) {
    // 现在使用新的token-list接口来获取总供应量
    const tokenInfo = await getLPTokenMaxSupply(tokenContractAddress);
    return {
        totalSupply: tokenInfo.maxSupply,
        symbol: tokenInfo.symbol,
        decimals: tokenInfo.decimals
    };
}

module.exports = {
    getTokenBalance,
    getAddressTokenBalances,
    getSpecificTokenBalance,
    getPoolDOGBalance,
    getPoolReserves,
    calculateUserPoolDOGHoldings,
    getLPTokenMaxSupply,
    getTokenTotalSupply,
    OKX_CONFIG,
    PROXY_CONFIG
};
