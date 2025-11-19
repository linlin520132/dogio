require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const fetch = require('node-fetch');

// 读取配置文件和用户数据
const usersData = JSON.parse(fs.readFileSync('users.json', 'utf8'));

// DOG代币合约地址
const DOG_CONTRACT = '0x903358faf7c6304afbd560e9e29b12ab1b8fddc5';

// 从环境变量读取配置，如果没有则使用默认值
const CONFIG = {
    // API配置 - 支持环境变量
    API_KEY: process.env.OKX_API_KEY,
    SECRET_KEY: process.env.OKX_API_SECRET,
    PASSPHRASE: process.env.OKX_API_PASSPHRASE,
    POOL_ADDRESS: '0x41027D3CaCc14F35Abd387B7350c05247e9Ac646', // 池子地址

    // Proxy配置 - 在工作流中默认启用代理
    USE_PROXY: process.env.USE_PROXY === 'true', // 环境变量可以设置为'false'来禁用代理
    PROXY_URL: process.env.PROXY_URL || 'socks5://127.0.0.1:10808',
    PROXY_TYPE: process.env.PROXY_TYPE || 'socks5'
};

// 生成API签名
function generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    const signature = crypto.createHmac('sha256', CONFIG.SECRET_KEY)
        .update(message)
        .digest('base64');
    return signature;
}

// 创建代理agent
function createProxyAgent() {
    if (!CONFIG.USE_PROXY) {
        return null;
    }

    try {
        console.log(`使用代理: ${CONFIG.PROXY_URL} (类型: ${CONFIG.PROXY_TYPE})`);

        let agent;
        if (CONFIG.PROXY_TYPE === 'socks5') {
            agent = new SocksProxyAgent(CONFIG.PROXY_URL);
        } else {
            // http/https代理
            agent = new HttpsProxyAgent(CONFIG.PROXY_URL);
        }

        console.log(`✅ 代理Agent创建成功: ${agent.constructor.name}`);
        return agent;
    } catch (error) {
        console.error('\n❌ 创建代理失败:');
        console.error(`错误类型: ${error.constructor.name}`);
        console.error(`错误消息: ${error.message}`);
        console.error(`代理URL: ${CONFIG.PROXY_URL}`);
        console.error(`代理类型: ${CONFIG.PROXY_TYPE}`);

        console.error('\n💡 代理配置建议:');
        console.error('- 确保代理服务器正在运行');
        console.error('- 检查代理地址格式是否正确');
        console.error('- 尝试不同的代理类型');
        console.error('- 确认代理支持HTTPS连接');

        return null;
    }
}

// 测试代理连接
async function testProxyConnection() {
    console.log('\n🧪 开始测试代理连接...');

    try {
        const proxyAgent = createProxyAgent();
        if (!proxyAgent) {
            console.log('❌ 代理Agent创建失败，跳过测试');
            return false;
        }
    } catch (error) {
        console.error('\n❌ 代理测试过程中发生未知错误:');
        console.error(`错误消息: ${error.message}`);
        return false;
    }
}

// 查询地址交易列表（分页获取所有数据）
async function queryAllTransactions(address) {
    const allTransactions = [];
    let hasMore = true;
    let currentPage = 1;
    let retryCount = 0;
    const maxRetries = 3;

    while (hasMore) {
        const timestamp = new Date().toISOString();
        const method = 'GET';
        const requestPath = '/api/v5/xlayer/address/transaction-list';

        const params = new URLSearchParams({
            chainShortName: 'XLAYER',
            address: address,
            protocolType: 'token_20', // 获取ERC20代币交易
            limit: '100', // 每次最多查询100条
            page: currentPage.toString()
        });

        const signature = generateSignature(timestamp, method, requestPath + '?' + params.toString());

        const headers = {
            'OK-ACCESS-KEY': CONFIG.API_KEY,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': CONFIG.PASSPHRASE,
            'OK-ACCESS-SIGN': signature,
            'Content-Type': 'application/json'
        };

        try {
            const url = `https://web3.okx.com${requestPath}?${params}`;
            console.log(`\n🔗 请求URL: ${url}`);
            console.log(`📝 请求方法: ${method}`);
            console.log(`🏷️ 请求头:`, JSON.stringify(headers, null, 2));

            const fetchOptions = {
                method: method,
                headers: headers
            };

            // 如果启用代理，添加代理agent
            const proxyAgent = createProxyAgent();
            if (proxyAgent) {
                fetchOptions.agent = proxyAgent;
                console.log(`✅ 代理已配置到请求选项中`);
                console.log(`🔍 代理对象类型: ${proxyAgent.constructor.name}`);
            } else {
                console.log(`⚠️ 代理未配置或创建失败，使用直连`);
            }

            console.log(`⏳ 正在发送请求...`);
            const response = await fetch(url, fetchOptions);

            console.log(`📡 响应状态: ${response.status} ${response.statusText}`);

            if (!response.ok) {
                console.error(`❌ HTTP请求失败 (状态码: ${response.status})`);
                const text = await response.text();
                console.error(`📄 错误响应内容:`, text.substring(0, 1000));

                // 根据状态码给出建议
                if (response.status === 401) {
                    console.error('💡 401错误: API密钥或签名验证失败');
                } else if (response.status === 403) {
                    console.error('💡 403错误: API访问被拒绝，可能是权限问题');
                } else if (response.status === 404) {
                    console.error('💡 404错误: API接口不存在或参数错误');
                } else if (response.status >= 500) {
                    console.error('💡 5xx错误: 服务器内部错误');
                }

                return allTransactions; // 返回已获取的数据
            }

            const data = await response.json();
            console.log(`API响应码: ${data.code}, 消息: ${JSON.stringify(data)}`);

            if (data && data.code === '0' && data.data && data.data.length > 0) {
                const transactionData = data.data[0];

                if (transactionData.transactionLists && transactionData.transactionLists.length > 0) {
                    allTransactions.push(...transactionData.transactionLists);

                    // 如果返回的数据少于100条，说明没有更多数据了
                    if (transactionData.transactionLists.length < 100) {
                        hasMore = false;
                    } else {
                        // 检查是否有更多页面
                        const returnedPage = parseInt(transactionData.page);
                        const totalPages = parseInt(transactionData.totalPage);

                        if (returnedPage >= totalPages) {
                            hasMore = false;
                        } else {
                            // 分页查询下一页
                            currentPage = returnedPage + 1;
                            console.log(`    已获取第 ${returnedPage} 页 ${allTransactions.length} 条记录，继续获取第 ${currentPage} 页...`);
                        }
                    }
                } else {
                    hasMore = false;
                }
            } else {
                hasMore = false;
            }

            // 请求成功，重置重试计数
            retryCount = 0;

            // API限流，避免请求过快
            await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error) {
            console.error(`\n❌ 查询地址 ${address} 第${currentPage}页失败 (重试 ${retryCount}/${maxRetries}):`);
            console.error(`错误类型: ${error.constructor.name}`);
            console.error(`错误消息: ${error.message}`);

            // 输出更详细的错误信息
            if (error.cause) {
                console.error(`错误原因: ${error.cause}`);
            }

            if (error.code) {
                console.error(`错误代码: ${error.code}`);
            }

            if (error.errno) {
                console.error(`系统错误号: ${error.errno}`);
            }

            if (error.syscall) {
                console.error(`系统调用: ${error.syscall}`);
            }

            // 检查是否可以重试
            if (retryCount < maxRetries) {
                retryCount++;
                console.log(`⏳ ${2 ** retryCount}秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, 2000 ** retryCount)); // 指数退避
                continue; // 继续下一次循环
            }

            // 检查是否是代理相关错误
            if (error.message.includes('proxy') || error.message.includes('tunnel') || error.message.includes('connect')) {
                console.error('\n💡 可能的解决方案:');
                console.error('1. 检查代理服务器是否正在运行');
                console.error('2. 确认代理地址和端口是否正确');
                console.error('3. 尝试更换代理类型 (http/socks5)');
                console.error('4. 检查防火墙设置');
            }

            console.error('❌ 重试次数已达上限，停止查询');
            console.error(''); // 空行分隔
            hasMore = false;
        }
    }

    return allTransactions;
}

// 获取池子所有转入的DOG代币交易
async function getPoolAllTransfers() {
    console.log('正在获取池子的所有DOG类型交易记录（强制刷新缓存）...');

    const cacheFile = 'pool-transactions-cache.json';

    // 获取新的数据 - 使用transaction-list接口获取所有交易
    const transactions = await queryAllTransactions(CONFIG.POOL_ADDRESS);
    const addLiquidityTransactions = transactions.filter(tx => tx.methodId === '0xe8e33700');

    // // 过滤出转入池子的交易（to地址是池子地址且交易符号是DOG）
    // const poolTransfers = transactions.filter(tx =>
    //     tx.to && tx.to.toLowerCase() === CONFIG.POOL_ADDRESS.toLowerCase() &&
    //     tx.transactionSymbol === 'DOG'
    // );

    // 保存到缓存文件
    const cacheData = {
        poolAddress: CONFIG.POOL_ADDRESS,
        tokenAddress: DOG_CONTRACT,
        transfers: addLiquidityTransactions,
        cacheTime: new Date().toISOString(),
        totalRecords: addLiquidityTransactions.length
    };

    fs.writeFileSync(cacheFile, JSON.stringify(cacheData, null, 2));
    console.log(`✅ 已获取并更新 ${addLiquidityTransactions.length} 条转入池子的DOG交易记录，已保存到缓存`);

    return addLiquidityTransactions;
}

// 主函数
async function main() {
    console.log('=== DOG代币池子转账统计 ===');
    console.log('::group::配置信息');

    // 配置检查
    console.log('📋 配置信息:');
    console.log(`   池子地址: ${CONFIG.POOL_ADDRESS}`);
    console.log(`   使用代理: ${CONFIG.USE_PROXY ? '是' : '否'}`);
    if (CONFIG.USE_PROXY) {
        console.log(`   代理地址: ${CONFIG.PROXY_URL} (${CONFIG.PROXY_TYPE})`);
    }
    console.log(`   API Key: ${CONFIG.API_KEY ? '已配置' : '未配置'}`);
    console.log('::endgroup::');
    console.log('');

    // 验证配置
    if (!CONFIG.API_KEY || !CONFIG.SECRET_KEY || !CONFIG.PASSPHRASE) {
        console.error('❌ API配置不完整，请检查环境变量或配置文件');
        process.exit(1);
    }

    // 检查配置
    if (CONFIG.API_KEY === 'your_api_key_here') {
        console.log('请先配置API_KEY等参数！');
        console.log('2. 注册账户并生成API key');
        console.log('3. 设置SECRET_KEY和PASSPHRASE');
        console.log('4. 设置POOL_ADDRESS（池子地址）');
        console.log('5. 如需使用代理，请设置USE_PROXY=true并配置PROXY_URL');
        return;
    }

    // 显示代理配置状态并测试连接
    if (CONFIG.USE_PROXY) {
        console.log(`✓ 已启用代理: ${CONFIG.PROXY_URL} (类型: ${CONFIG.PROXY_TYPE})`);

        // 测试代理连接
        const proxyWorking = await testProxyConnection();
        if (!proxyWorking) {
            console.log('\n⚠️ 代理测试失败，但继续执行主流程...');
            console.log('你可以忽略此警告继续运行，或修复代理配置');
        }
    } else {
        console.log('ℹ 未启用代理，如遇网络问题请配置代理');
        console.log('  配置方法: 设置USE_PROXY=true并配置PROXY_URL');
    }

    // 第一步：获取池子的所有转账记录（带缓存）
    console.log('::group::获取池子转账数据');
    const poolTransfers = await getPoolAllTransfers();
    console.log('::endgroup::');

    if (poolTransfers.length === 0) {
        console.log('未找到任何转入池子的DOG交易记录');
        return;
    }

    console.log('::group::统计用户转账情况');
    console.log(`开始统计users.json中用户的转账情况...`);

    // 第二步：创建用户地址映射（address -> user）
    const addressToUser = new Map();
    usersData.forEach(user => {
        user.addresses.forEach(address => {
            addressToUser.set(address.toLowerCase(), user);
        });
    });

    // 第三步：统计每个用户的转账情况
    const userStats = new Map();

    poolTransfers.forEach(tx => {
        const fromAddress = tx.from.toLowerCase();
        const user = addressToUser.get(fromAddress);

        if (user) {
            let amount = 0;

            // transaction-list接口的数据结构
            if (tx.amount) {
                amount = parseFloat(tx.amount);
            } else if (tx.value) {
                amount = parseFloat(tx.value);
            } else {
                console.log(`无法获取交易金额:`, tx.hash || tx.txId);
                return;
            }

            if (userStats.has(user.nickname)) {
                const stats = userStats.get(user.nickname);
                stats.totalAmount += amount;
                stats.transactionCount += 1;
                stats.transactions.push(tx);
            } else {
                userStats.set(user.nickname, {
                    nickname: user.nickname,
                    totalAmount: amount,
                    transactionCount: 1,
                    transactions: [tx]
                });
            }
        }
    });

    // 转换为数组并排序
    const userStatsArray = Array.from(userStats.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    // 计算总计
    const totalTransferred = userStatsArray.reduce((sum, user) => sum + user.totalAmount, 0);
    const totalTransactions = userStatsArray.reduce((sum, user) => sum + user.transactionCount, 0);

    // 输出统计结果
    console.log('\n=== 统计结果 ===');
    console.log(`总转账金额: ${totalTransferred.toLocaleString()} DOG`);
    console.log(`总转账笔数: ${totalTransactions} 笔`);
    console.log(`涉及用户数: ${userStatsArray.length} 个`);
    console.log(`池子总转入记录数: ${poolTransfers.length} 条`);

    console.log('\n=== 用户转账详情（按金额排序） ===');
    userStatsArray.forEach((user, index) => {
        console.log(`${index + 1}. ${user.nickname}: ${user.totalAmount.toLocaleString()} DOG (${user.transactionCount} 笔)`);
    });

    // 保存详细结果到文件
    const result = {
        summary: {
            totalTransferred,
            totalTransactions,
            usersInvolved: userStatsArray.length,
            poolTotalRecords: poolTransfers.length,
            poolAddress: CONFIG.POOL_ADDRESS
        },
        userDetails: userStatsArray,
        poolTransfers: poolTransfers,
        queryTime: new Date().toISOString()
    };

    fs.writeFileSync('pool-transfer-stats.json', JSON.stringify(result, null, 2));
    console.log('\n详细结果已保存到 pool-transfer-stats.json');

    // 保存简化版本（只包含统计信息，不包含详细交易记录）
    const simpleResult = {
        summary: result.summary,
        userDetails: userStatsArray.map(user => ({
            nickname: user.nickname,
            totalAmount: user.totalAmount,
            transactionCount: user.transactionCount
        })),
        queryTime: result.queryTime
    };

    fs.writeFileSync('pool-transfer-stats-simple.json', JSON.stringify(simpleResult, null, 2));
    console.log('简化结果已保存到 pool-transfer-stats-simple.json');
    console.log('::endgroup::');
}

main().catch(console.error);


