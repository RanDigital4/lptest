/* RND deployment configuration. Verify the deployed bytecode/source before enabling mainnet transactions. */
window.RND_CONFIG = {
  chainId: 56,
  chainHex: '0x38',
  chainName: 'BNB Smart Chain',
  rpcUrls: ['https://bsc-dataseed.binance.org/','https://bsc.publicnode.com','https://bsc-dataseed-public.bnbchain.org'],
  explorer: 'https://bscscan.com',
  locker: '0xC986601a2FB2f4763147D2CD3A6742353f0eF718',
  rnd: '0xcF1FbF18bE9202865bcf88E6349B9D207F75942d',
  usdt: '0x55d398326f99059fF775485246999027B3197955',
  lpPair: '0xd6f291A4dBEfa0ff99B07d247Aa73Ff7c20e9991',
  // Set this to the actual deployment block to make history queries faster.
  deploymentBlock: 0,
  // ABI generated from the supplied RNDAutoLPReferralLocker.sol source.
  lockerAbi: [
    'function BSC_CHAIN_ID() view returns (uint256)','function RND() view returns (address)','function USDT() view returns (address)','function PANCAKE_V2_FACTORY() view returns (address)','function PANCAKE_V2_ROUTER() view returns (address)','function LP_PAIR() view returns (address)',
    'function LOCK_DURATION() view returns (uint256)','function MIN_REWARD_STEP_USDT() view returns (uint256)','function REWARD_PER_STEP() view returns (uint256)','function REFERRAL_BPS() view returns (uint256)','function BPS_DENOMINATOR() view returns (uint256)',
    'function nextPositionId() view returns (uint256)','function totalLPLocked() view returns (uint256)','function totalOutstandingRewards() view returns (uint256)','function totalRegisteredUsers() view returns (uint256)','function observationCount() view returns (uint256)','function rewardReserveBalance() view returns (uint256)',
    'function register(address referrer)','function updatePriceObservation()','function getTwapPriceRNDInUSDT() view returns (uint256)','function previewReward(uint256 usdtAmount,uint256 rndAmount) view returns (uint256 rndValueUSDT,uint256 userReward,uint256 referralReward)',
    'function addLiquidityAndLock(uint256 usdtDesired,uint256 rndDesired,uint256 usdtMin,uint256 rndMin,address referrer,uint256 deadline) returns (uint256 positionId)',
    'function withdrawLP(uint256 positionId,uint256 minUSDT,uint256 minRND,uint256 deadline)','function claimRewards(uint256 positionId)',
    'function getUserInfo(address user) view returns (tuple(bool registered,address referrer,uint64 registeredAt))',
    'function getReferralCount(address referrer) view returns (uint256)','function getReferredUsers(address referrer) view returns (address[])',
    'function getReferralRewardCount(address referrer) view returns (uint256)','function getReferralRewardRecord(address referrer,uint256 index) view returns (tuple(uint256 positionId,address referredUser,uint256 amount,uint64 unlockAt,bool claimed))',
    'function getPosition(uint256 positionId) view returns (tuple(address user,address referrer,uint256 lpAmount,uint256 usdtAdded,uint256 rndAdded,uint256 rndValueInUSDT,uint256 rewardAmount,uint256 referralRewardAmount,uint64 lockedAt,uint64 unlockAt,uint256 referralRecordIndex,bool lpWithdrawn,bool rewardsClaimed))',
    'function getUserPositionIds(address user) view returns (uint256[])','function getUserPositionCount(address user) view returns (uint256)','function getObservation(uint256 index) view returns (tuple(uint256 price0Cumulative,uint256 price1Cumulative,uint64 timestamp,bool exists))',
    'event UserRegistered(address indexed user,address indexed referrer,uint256 timestamp)','event OracleObservationUpdated(uint256 indexed timestamp,uint256 price0Cumulative,uint256 price1Cumulative)',
    'event LiquidityAddedAndLocked(uint256 indexed positionId,address indexed user,address indexed referrer,uint256 usdtUsed,uint256 rndUsed,uint256 lpAmount,uint256 userReward,uint256 referralReward,uint256 unlockAt)',
    'event LPWithdrawn(uint256 indexed positionId,address indexed user,uint256 usdtReceived,uint256 rndReceived)','event RewardsClaimed(uint256 indexed positionId,address indexed user,address indexed referrer,uint256 userReward,uint256 referralReward)',
    'event ReferralRewardAccrued(address indexed referrer,address indexed referredUser,uint256 indexed positionId,uint256 amount,uint256 unlockAt)'
  ],
  erc20Abi: ['function allowance(address owner,address spender) view returns (uint256)','function approve(address spender,uint256 amount) returns (bool)','function balanceOf(address account) view returns (uint256)','function decimals() view returns (uint8)','function symbol() view returns (string)']
};
