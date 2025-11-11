require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// 配置代理支持
const { HttpsProxyAgent } = require('https-proxy-agent');
const fetch = require('node-fetch');

// 尝试检测系统代理或使用环境变量中的代理
let agent = null;
// const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY ||
//                  process.env.http_proxy || process.env.https_proxy ||
//                  'http://127.0.0.1:10808'; // 常见的代理端口

// try {
//     agent = new HttpsProxyAgent(proxyUrl);
//     console.log('使用代理:', proxyUrl);
// } catch (error) {
//     console.log('代理配置失败，使用直接连接:', error.message);
// }

const app = express();
const PORT = process.env.PORT || 3000;

// 配置CORS
const cors = require('cors');
app.use(cors({
    origin: true, // 允许所有origin
    credentials: true
}));

// 用户数据 - 新结构：地址数组、余额数组、合计、百分比
const users = [
    {
        "nickname": "OKX官方钱包",
        "addresses": [
            "0xa1d2c4533d867ce4623681f68df84d9cad73cb6b"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 131452001.01,
        "percentage": 0
    },
    {
        "nickname": "吉姆熊猫",
        "addresses": [
            "0x4d6ae7eb9c767436fdc91ad1498d7c3ded176afc"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 174750118,
        "percentage": 0
    },
    {
        "nickname": "锋人院",
        "addresses": [
            "0x889015d2d53c53474c276dcfaf614b294edafc97"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 103121334,
        "percentage": 0
    },
    {
        "nickname": "道哥币赢",
        "addresses": [
            "0xb05db08b8067ee5007d7bbb7690afd391048b4cf",
            "0xe49c97662513c138b1701EEbFd02c955C025e16E"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 282000000,
        "percentage": 0
    },
    {
        "nickname": "听风",
        "addresses": [
            "0xb31bb9be6619a7d67cf2a796117ce6487a66d726"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 101047917,
        "percentage": 0
    },
    {
        "nickname": "山河",
        "addresses": [
            "0x71e8b7257873ef4312Cd16DcD0c6CBaeAaBDAA24"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "成成",
        "addresses": [
            "0x983191d9Ad653C0fD00DCA01AA6fa9165bA3Abfc"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 105736479,
        "percentage": 0
    },
    {
        "nickname": "小K",
        "addresses": [
            "0x4a43d690bd6111c4fc819bd537b2e3e5f21a385e"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 106896928,
        "percentage": 0
    },
    {
        "nickname": "Cassie",
        "addresses": [
            "0x30d49154f73b91557c757eba54a9a4ca8ad4999c",
            "0xa5ba4477a52c2be6f3b3795a1b7fba00cd365df0"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 116268461,
        "percentage": 0
    },
    {
        "nickname": "慕兮",
        "addresses": [
            "0x92498505a053c3a74d52ff76194ec2249412ab45"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 115532138,
        "percentage": 0
    },
    {
        "nickname": "斯奈夫",
        "addresses": [
            "0x1b0f46a63b290a87608d5723e64aade90204b308"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 140000000,
        "percentage": 0
    },
    {
        "nickname": "zhengch",
        "addresses": [
            "0x4dbd81e45023a64af8d75a7b94a8e04fe17f9031",
            "0xfc250ce0ec2f48f45050043e3bd0ee9b940383a3",
            "0xc865e2efe116fdb67575cdd5e3bbe594abedbba9"
        ],
        "currentBalances": [
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 125545211,
        "percentage": 0
    },
    {
        "nickname": "跑步二十天",
        "addresses": [
            "0xd65d8de84ce7d92dd97511910233bc10731d8fd0"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 97863993,
        "percentage": 0
    },
    {
        "nickname": "无鱼",
        "addresses": [
            "0x6d46361ed4fbc6cc69766a8f61ab7765cf765ca2",
            "0x98519325a97536de1f048673001fdefbf2c03009"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 105940786,
        "percentage": 0
    },
    {
        "nickname": "树藤与海岛",
        "addresses": [
            "0x5eb69c55008008538fd1c9d541679d013fb04a9a"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 354034708,
        "percentage": 0
    },
    {
        "nickname": "代号火麒麟",
        "addresses": [
            "0x59222e6e3b8d0e713c55731f83bff0455e70050c",
            "0x763b103af34571e6d8fce69d96189b12688a85c2",
            "0xe4458dd49b3adda2a784228279f7486b88c97fac"
        ],
        "currentBalances": [
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100800000,
        "percentage": 0
    },
    {
        "nickname": "羽辰",
        "addresses": [
            "0xf13d79bae5886b189a3c55c0bb81a0dcfdcac8c5"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 131000000,
        "percentage": 0
    },
    {
        "nickname": "老铁Bro",
        "addresses": [
            "0x49c7824ff4a75b549bf4a8d3bf5e3abc75eb17e8",
            "0x527dc9447633c70f4b7efab861af1853ccfdc69b",
            "0xbf85c69edd38d1272d951f3aca6fcfbb86ba1af0",
            "0x4f0fdaadae3551f7236c9dc2042676a04a368cac",
            "0x9cbdd9ef08f24e74d75684afd19c8bf132c2a966"
        ],
        "currentBalances": [
            0,
            0,
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 107990248,
        "percentage": 0
    },
    {
        "nickname": "屁屁",
        "addresses": [
            "0x249a3bb394aecb6c73b799f86ab297d24b9a3194",
            "0x5cb50aff7357c71665eaa8b28fefcc9a32dabd69",
            "0xb1ed284b6759b23b375688dcb8471fcd94cf4450",
            "0x1cc19ee7f40d2b9204e6d527adf89baf7fb091af",
            "0x26e3a3381d17bc002e28282253b9a46bef9e138e",
            "0xf335291deacc922f3ceacdcf3403e878f3b1b851"
        ],
        "currentBalances": [
            0,
            0,
            0,
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 200000000,
        "percentage": 0
    },
    {
        "nickname": "LV",
        "addresses": [
            "0xb244df3bEb6D7531Ea4b55435f444bff318BdD92"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 150000000,
        "percentage": 0
    },
    {
        "nickname": "东风（叶军民）",
        "addresses": [
            "0x6D5F722b0BeB821a5337F505cEF03888795E1d56"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 118000000,
        "percentage": 0
    },
    {
        "nickname": "memecoin",
        "addresses": [
            "0x7855F676b7B2A370FB7E6eD74Bde705fdc890230",
            "0x9F3d2b0C438c7A1E8FAcadFD878b7caE2718205F",
            "0x196d31736a1F52FB65a15218718F522C38e52eCd",
            "0xAb0DD2b23031E73f47a7C9B1cd6715Aa5E5993C6"
        ],
        "currentBalances": [
            0,
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 101000000,
        "percentage": 0
    },
    {
        "nickname": "小狗旺旺",
        "addresses": [
            "0x1e3a1e33d82a21e04a2d269dbe4f0fcd324043be",
            "0x8199d7f2a479c4e223bc91f0d1ad922956884ac4",
            "0xe4aae38402ab4749f518117bf38f84ff814b860c"
        ],
        "currentBalances": [
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 483285115,
        "percentage": 0
    },
    {
        "nickname": "沙漠绿洲",
        "addresses": [
            "0x750f9a6ae2b57e0c3ea9f172fe8e48422d4f1c78"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 120000000,
        "percentage": 0
    },
    {
        "nickname": "☁️",
        "addresses": [
            "0x9EEAE0DEAaa932ACC49Cfc935Bb997E6779E1E83"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "@野火（蒙）",
        "addresses": [
            "0x1ac9acbaffe938b4cb7fbb0eb88f641cfb690837"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 102286355,
        "percentage": 0
    },
    {
        "nickname": "上官允禾",
        "addresses": [
            "0xA6640E4856E4A2f2b754f64AD3dA73FBC724b6Ba"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "城",
        "addresses": [
            "0x78147ca45b59a3e96076fcbf68c3a99260d67e0b",
            "0x5ae833c58febd21c4c99fa78407b18e3d3e83b95"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 120000000,
        "percentage": 0
    },
    {
        "nickname": "DOG王",
        "addresses": [
            "0xeceb024766c13347d061b3e6a5d07a4fc86cc03f",
            "0x66bb878e0ecaf689667fd83848e25a0e42fb8441",
            "0xd9f1497619e3467e4196ae64446d590d8cb2a257"
        ],
        "currentBalances": [
            0,
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000500,
        "percentage": 0
    },
    {
        "nickname": "旷谷",
        "addresses": [
            "0x67c1103a967f3150d1fa5e3d70dae8e70c713950"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 101000000,
        "percentage": 0
    },
    {
        "nickname": "如果 爱",
        "addresses": [
            "0x21fb80e72af9ca930cfe744906adfbd24460b876",
            "0x87291db3d8f08c4cad35744f45150717fd10c310"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 119725915,
        "percentage": 0
    },
    {
        "nickname": "闲云",
        "addresses": [
            "0x6f58b15911cd025e0ee807704579480fb89b8a1c"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 302072896,
        "percentage": 0
    },
    {
        "nickname": "我",
        "addresses": [
            "0x175eb87bf2c1d6b79cacf5f05428eeb5c922d374"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 110000000,
        "percentage": 0
    },
    {
        "nickname": "小雨",
        "addresses": [
            "0x5816d5b5d4bc487ba4484ab4b25402436afdb2a1"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "2025国泰民安",
        "addresses": [
            "0x359ba4ff0efab569ed1c65d2bd69d08e4aa67a88",
            "0x6050df3e868d6baea660f6c0ad49930bc5ad66c3"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 205343380,
        "percentage": 0
    },
    {
        "nickname": "哈密瓜",
        "addresses": [
            "0x3069b7e82a1b459047b3e356db8139cdc0ff6747"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 853000000,
        "percentage": 0
    },
    {
        "nickname": "leezerofly",
        "addresses": [
            "0x82ba6bf0a655344e6c8863af13188658a4894bd2",
            "0xdbb4655a567e205ee7490ab18aa30c7f043b65b2"
        ],
        "currentBalances": [
            0,
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 186210563,
        "percentage": 0
    },
    {
        "nickname": "像风像雨又像雾",
        "addresses": [
            "0x1Cca692040370eca92C81002d1Cee9Ef9D3CCeC0"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 108000000,
        "percentage": 0
    },
    {
        "nickname": "焚石",
        "addresses": [
            "0x67514d3219fd78AA1e6d528fBa32A589a167968c"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 200000000,
        "percentage": 0
    },
    {
        "nickname": "韭菜人生",
        "addresses": [
            "0x48388fa2485ee89bbcc3898c56f3482abd338e5d",
            "0xcd43f9e7ee6af34429e003b4e64dfe41c3444465"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 140000000,
        "percentage": 0
    },
    {
        "nickname": "墨白",
        "addresses": [
            "0x1df0feab384bafab0f16c0f5d24aad5884a584a4",
            "0xea7456d61e26eb2239b6ecd1c27865a6202ea54e",
            "0xff63286dfb1a0eb4d35b862ab95b03e0610e9160",
            "0x3515bd277bb2c5b043388bcaec91a07755a06a33"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "旺旺",
        "addresses": [
            "0x893f3a08f24b9f394e32398a85be8a04a306e810"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 250000000,
        "percentage": 0
    },
    {
        "nickname": "吴坚不摧",
        "addresses": [
            "0xfd60cfbfe9223f6a15a5935f27663dcb98f96d7a",
            "0xd7756a84530a750cfd0ccaaac659826a07037f88"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 110261409,
        "percentage": 0
    },
    {
        "nickname": "香香",
        "addresses": [
            "0xA9bb36C922cD1312D0495054F374EF4CbDcd21A0",
            "0x5cE08548C79D59B728Fb9BeEd3c127B7be55512c"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100177579,
        "percentage": 0
    },
    {
        "nickname": "会飞的小猪",
        "addresses": [
            "0x45d0db9b652b64a557d5f5251dfcd559ff9cb3fb",
            "0xf2f38c4eefbe10e4e57ca90e7d55539abc459816"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100000000,
        "percentage": 0
    },
    {
        "nickname": "小柒柒",
        "addresses": [
            "0xe996c541b6aefb38c6c055d89077cfab527a1d34"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 110000000,
        "percentage": 0
    },
    {
        "nickname": "小小",
        "addresses": [
            "0xEA0f8b9271b29bd9333B5a4116db099E88c30C50"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 106600002,
        "percentage": 0
    },
    {
        "nickname": "大白",
        "addresses": [
            "0xc374acd9a7683aa9e6c48586370b6d8245ee21cc"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 243000000,
        "percentage": 0
    },
    {
        "nickname": "努力赚钱",
        "addresses": [
            "0x4ec33e28f1e191920e61b246eA9bf635934a05Da"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 149000000,
        "percentage": 0
    },
    {
        "nickname": "以马内利",
        "addresses": [
            "0x636B9803BB09199B9102CfBCc441BFa592B653dd",
            "0x344650ee072610438636d1A40dC16dC93de576F8"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 111491843,
        "percentage": 0
    },
    {
        "nickname": "繁星社区~甘",
        "addresses": [
            "0x8D15e83964B99e2FC6995cA6D308D8501fcE57B3"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 118710390,
        "percentage": 0
    },
    {
        "nickname": "观明",
        "addresses": [
            "0x3e36e49d20b695a09b503ab3c5860b875f762838",
            "0xe764dc12b1968244e70915949a29575f5a11aa2f"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 94539367,
        "percentage": 0
    },
    {
        "nickname": "狂飚",
        "addresses": [
            "0x362ead7ca70e0143eaf28f0e9e741619acc369ea"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 438322123.05,
        "percentage": 0
    },
    {
        "nickname": "星星之火",
        "addresses": [
            "0x8be8026CF67CA39ce6863796908ED68bf9eE948E"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 118478429,
        "percentage": 0
    },
    {
        "nickname": "Mojito",
        "addresses": [
            "0x5bc535157bd630410feb6b133ff5a4eead0f6da0"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 115680242,
        "percentage": 0
    },
    {
        "nickname": "遥远的传说",
        "addresses": [
            "0xD8052678472EbB88fd608E8B2651cDB4A6573297"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100477828.3,
        "percentage": 0
    },
    {
        "nickname": "炮兵连长",
        "addresses": [
            "0x4f9059182a44bee2d76927954823055c22701804",
            "0x782df47944e38b102f3cadf78775a1663d4ae5a8",
            "0x7ab43ef55f57bdcdb6e814210b89ea8328a0f67a",
            "0xb4a39abbc482adb85e56e6de509beb99b4d456cb",
            "0x4a4da66a874977143adef4fd07efdadfade78e57",
            "0xfd4c38829463be694e47e347f3c9a0e3bada65e9",
            "0xa485d4d438a3be6265f235a8074e48c9cc034088",
            "0x89eb4d4c75a69004fc76c4225284ebf079650ef6",
            "0x42b361ad83c965ba6b31c2f7283b594a68e8249b"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 92752164.2,
        "percentage": 0
    },
    {
        "nickname": "安德鲁",
        "addresses": [
            "0x009cc2efe3f94a446c371093d15ae8d12a3d71ff"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100115936.87,
        "percentage": 0
    },
    {
        "nickname": "jasper",
        "addresses": [
            "0x550b64e50f7df0179916082171f034450ee05edb"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 108130301.14,
        "percentage": 0
    },
    {
        "nickname": "一骑红尘",
        "addresses": [
            "0xa3d49262df354b6986d071a51bb1ebf950cb66db"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 100041389.75,
        "percentage": 0
    },
    {
        "nickname": "启航人生",
        "addresses": [
            "0xef1b1BB7F82f95DB48dF69818012Fcdd804466bE"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 193512247.6,
        "percentage": 0
    },
    {
        "nickname": "一個太陽",
        "addresses": [
            "0x7CFA1595d6a8d6E3Ee4c56f51dC5432a0B5Ae0F5"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 107264302.27,
        "percentage": 0
    },
    {
        "nickname": "神秘人",
        "addresses": [
            "0x239611ea0488b8a4bfe3b7dcd205baebd6c3a99f"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 309788246.54,
        "percentage": 0
    },
    {
        "nickname": "Zhong-zheng Cai",
        "addresses": [
            "0x505998fc8685186a200c7a56c2aaf87584b14508"
        ],
        "currentBalances": [
            0
        ],
        "totalBalance": 0,
        "initialBalanceTotal": 220222945.44,
        "percentage": 0
    }
];

// DOG代币合约地址
const DOG_CONTRACT = '0x903358faf7c6304afbd560e9e29b12ab1b8fddc5';

// OKX API配置 - 请在.env文件中设置环境变量
const OKX_CONFIG = {
    apiKey: process.env.OKX_API_KEY,
    apiSecret: process.env.OKX_API_SECRET,
    apiPassphrase: process.env.OKX_API_PASSPHRASE,
    chainIndex: '196'
};

// 检查API配置
if (!OKX_CONFIG.apiKey || !OKX_CONFIG.apiSecret || !OKX_CONFIG.apiPassphrase) {
    console.error('请在.env文件中配置OKX API凭证:');
    console.error('OKX_API_KEY=your_api_key_here');
    console.error('OKX_API_SECRET=your_api_secret_here');
    console.error('OKX_API_PASSPHRASE=your_passphrase_here');
    process.exit(1);
}

// 缓存数据
let balanceCache = {};
let lastUpdateTime = null;
let isUpdating = false;

// 创建OKX API签名
function createSignature(method, requestPath, body = '') {
    const timestamp = new Date().toISOString().slice(0, -5) + 'Z';
    const message = timestamp + method + requestPath + body;

    const hmac = crypto.createHmac('sha256', OKX_CONFIG.apiSecret);
    hmac.update(message);
    const signature = hmac.digest('base64');

    return { signature, timestamp };
}

// 获取单个地址的余额
async function getTokenBalance(address, tokenContractAddress, retryCount = 0) {
    const maxRetries = 3;
    const requestBody = {
        address: address,
        tokenContractAddresses: [{
            chainIndex: OKX_CONFIG.chainIndex,
            tokenContractAddress: tokenContractAddress
        }]
    };

    try {
        const { signature, timestamp } = createSignature('POST', '/api/v6/dex/balance/token-balances-by-address', JSON.stringify(requestBody));

        const response = await fetch('https://web3.okx.com/api/v6/dex/balance/token-balances-by-address', {
            method: 'POST',
            headers: {
                'OK-ACCESS-KEY': OKX_CONFIG.apiKey,
                'OK-ACCESS-SIGN': signature,
                'OK-ACCESS-TIMESTAMP': timestamp,
                'OK-ACCESS-PASSPHRASE': OKX_CONFIG.apiPassphrase,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody),
            agent: agent // 使用代理
        });

        const result = await response.json();

        if (result.code !== '0') {
            throw new Error(`OKX API错误: ${result.msg || '未知错误'}`);
        }

        if (result.data && result.data.length > 0 && result.data[0].tokenAssets && result.data[0].tokenAssets.length > 0) {
            const tokenAsset = result.data[0].tokenAssets[0];
            return {
                balance: parseFloat(tokenAsset.balance),
                rawBalance: tokenAsset.rawBalance || '0',
                symbol: tokenAsset.symbol || 'DOG'
            };
        }

        return { balance: 0, rawBalance: '0', symbol: 'DOG' };

    } catch (error) {
        console.error(`获取地址 ${address} 余额失败 (重试 ${retryCount}/${maxRetries}):`, error.message);

        if (retryCount < maxRetries) {
            // 等待1.5秒后重试
            await new Promise(resolve => setTimeout(resolve, 1500));
            return getTokenBalance(address, tokenContractAddress, retryCount + 1);
        }

        // 达到最大重试次数，返回失败结果
        return { balance: 0, rawBalance: '0', symbol: 'DOG', error: error.message };
    }
}

// 更新所有余额数据
async function updateAllBalances() {
    if (isUpdating) {
        console.log('已有更新任务进行中，跳过此次更新');
        return;
    }

    console.log('开始更新所有余额数据...');
    isUpdating = true;
    const startTime = Date.now();

    try {
        const newCache = {};

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            let totalBalance = 0;
            const addressBalances = [];

            // 为每个用户的每个地址获取余额
            for (let j = 0; j < user.addresses.length; j++) {
                const address = user.addresses[j];
                console.log(`正在获取 ${user.nickname} (${address.slice(0, 6)}...${address.slice(-4)}) 的余额...`);

                const balanceData = await getTokenBalance(address, DOG_CONTRACT);
                const balance = balanceData.balance || 0;
                totalBalance += balance;
                addressBalances.push(balance);

                // 缓存每个地址的结果
                newCache[address] = {
                ...balanceData,
                nickname: user.nickname,
                    address: address,
                    initialBalanceTotal: user.initialBalanceTotal,
                lastUpdate: new Date().toISOString()
            };

                // 每个地址请求之间等待500ms
                if (j < user.addresses.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // 更新用户数据
            user.currentBalances = addressBalances;
            user.totalBalance = totalBalance;
            user.percentage = user.initialBalanceTotal > 0 ? ((totalBalance - user.initialBalanceTotal) / user.initialBalanceTotal) * 100 : 0;

            console.log(`${user.nickname} 总余额: ${totalBalance.toLocaleString()}, 百分比: ${user.percentage.toFixed(2)}%`);

            // 每个用户之间等待1秒
            if (i < users.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // 更新缓存
        balanceCache = newCache;
        lastUpdateTime = new Date().toISOString();

        const duration = Math.round((Date.now() - startTime) / 1000);
        const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);
        console.log(`余额数据更新完成，耗时 ${duration} 秒，共处理 ${users.length} 个用户，${totalAddresses} 个地址`);

    } catch (error) {
        console.error('批量更新余额失败:', error);
    } finally {
        isUpdating = false;
    }
}

// 启动定时任务 - 每10分钟更新一次
function startScheduledUpdates() {
    console.log('启动定时更新任务 - 每10分钟更新一次');

    // 立即执行一次
    updateAllBalances();

    // 设置定时器，每10分钟执行一次
    setInterval(() => {
        updateAllBalances();
    }, 10 * 60 * 1000); // 10分钟 = 10 * 60 * 1000 毫秒
}

// API路由
app.use(express.json());

// 获取余额数据API
app.get('/api/balances', (req, res) => {
    const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);

    // 检查是否是JSONP请求
    const callback = req.query.callback;
    const responseData = {
        success: true,
        data: {
            users: users,
            lastUpdate: lastUpdateTime,
            totalUsers: users.length,
            totalAddresses: totalAddresses,
            cachedAddresses: Object.keys(balanceCache).length
        }
    };

    if (callback) {
        // JSONP响应
        res.setHeader('Content-Type', 'application/javascript');
        res.send(`${callback}(${JSON.stringify(responseData)});`);
    } else {
        // 普通JSON响应
        res.json(responseData);
    }
});

// 获取状态信息API
app.get('/api/status', (req, res) => {
    const totalAddresses = users.reduce((sum, user) => sum + user.addresses.length, 0);
    res.json({
        success: true,
        data: {
            isUpdating,
            lastUpdateTime,
            totalUsers: users.length,
            totalAddresses: totalAddresses,
            cachedAddresses: Object.keys(balanceCache).length
        }
    });
});

// 手动触发更新API
app.post('/api/update', async (req, res) => {
    try {
        await updateAllBalances();
        res.json({
            success: true,
            message: '余额更新完成'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: '更新失败',
            error: error.message
        });
    }
});

// 启动HTTP服务器
app.listen(PORT, () => {
    console.log(`DOG余额监控服务器运行在端口 ${PORT}`);
    console.log(`API地址: http://localhost:${PORT}`);
});

// 尝试启动HTTPS服务器
const httpsPort = 3443;
try {
    const sslKeyPath = path.join(__dirname, '148.135.52.253-key.pem');
    const sslCertPath = path.join(__dirname, '148.135.52.253.pem');

    if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const https = require('https');
        const httpsOptions = {
            key: fs.readFileSync(sslKeyPath),
            cert: fs.readFileSync(sslCertPath)
        };

        const httpsServer = https.createServer(httpsOptions, app);
        httpsServer.listen(httpsPort, '0.0.0.0', () => {
            console.log(`HTTPS服务器运行在端口 ${httpsPort}`);
            console.log(`HTTPS API地址: https://148.135.52.253:${httpsPort}`);
        });

        // 在HTTPS服务器启动后启动定时更新任务
        startScheduledUpdates();
    } else {
        console.log('SSL证书文件不存在，使用HTTP模式');
        console.log('如需HTTPS，请运行以下命令生成证书：');
        console.log('npm install -g mkcert');
        console.log('mkcert -install');
        console.log('mkcert 148.135.52.253');

        // HTTP模式下也启动定时更新任务
        startScheduledUpdates();
    }
} catch (error) {
    console.error('HTTPS服务器启动失败:', error.message);
    console.log('将继续使用HTTP模式');

    // 出错时也启动定时更新任务
    startScheduledUpdates();
}

// 优雅关闭
process.on('SIGINT', () => {
    console.log('正在关闭服务器...');
    process.exit(0);
});
