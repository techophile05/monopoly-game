// ============================================================
// MONOPOLY INDIA - Game Data
// ============================================================

const BOARD_SPACES = [
  // Bottom row (right to left): positions 0-10
  { id: 0,  name: 'GO',              type: 'go' },
  { id: 1,  name: 'Varanasi',        type: 'property', color: 'brown',     price: 60,   rent: [2, 10, 30, 90, 160, 250],    houseCost: 50,  group: 'brown' },
  { id: 2,  name: 'Karma',           type: 'karma' },
  { id: 3,  name: 'Jaisalmer',       type: 'property', color: 'brown',     price: 60,   rent: [4, 20, 60, 180, 320, 450],   houseCost: 50,  group: 'brown' },
  { id: 4,  name: 'Income Tax',      type: 'tax',      amount: 200 },
  { id: 5,  name: 'Mumbai Central',  type: 'railroad', price: 200, group: 'railroad' },
  { id: 6,  name: 'Jaipur',          type: 'property', color: 'lightblue', price: 100,  rent: [6, 30, 90, 270, 400, 550],   houseCost: 50,  group: 'lightblue' },
  { id: 7,  name: 'Chance',          type: 'chance' },
  { id: 8,  name: 'Lucknow',         type: 'property', color: 'lightblue', price: 100,  rent: [6, 30, 90, 270, 400, 550],   houseCost: 50,  group: 'lightblue' },
  { id: 9,  name: 'Amritsar',        type: 'property', color: 'lightblue', price: 120,  rent: [8, 40, 100, 300, 450, 600],  houseCost: 50,  group: 'lightblue' },
  { id: 10, name: 'Jail / Visit',    type: 'jail' },

  // Left column (bottom to top): positions 11-19
  { id: 11, name: 'Kolkata',          type: 'property', color: 'pink',     price: 140,  rent: [10, 50, 150, 450, 625, 750],  houseCost: 100, group: 'pink' },
  { id: 12, name: 'Tata Power',       type: 'utility',  price: 150, group: 'utility' },
  { id: 13, name: 'Ahmedabad',        type: 'property', color: 'pink',     price: 140,  rent: [10, 50, 150, 450, 625, 750],  houseCost: 100, group: 'pink' },
  { id: 14, name: 'Pune',             type: 'property', color: 'pink',     price: 160,  rent: [12, 60, 180, 500, 700, 900],  houseCost: 100, group: 'pink' },
  { id: 15, name: 'New Delhi Railway',type: 'railroad', price: 200, group: 'railroad' },
  { id: 16, name: 'Hyderabad',        type: 'property', color: 'orange',   price: 180,  rent: [14, 70, 200, 550, 750, 950],  houseCost: 100, group: 'orange' },
  { id: 17, name: 'Karma',            type: 'karma' },
  { id: 18, name: 'Chennai',          type: 'property', color: 'orange',   price: 180,  rent: [14, 70, 200, 550, 750, 950],  houseCost: 100, group: 'orange' },
  { id: 19, name: 'Chandigarh',       type: 'property', color: 'orange',   price: 200,  rent: [16, 80, 220, 600, 800, 1000], houseCost: 100, group: 'orange' },

  // Top row (left to right): positions 20-30
  { id: 20, name: 'Free Parking',     type: 'freeparking' },
  { id: 21, name: 'Bangalore',        type: 'property', color: 'red',      price: 220,  rent: [18, 90, 250, 700, 875, 1050],  houseCost: 150, group: 'red' },
  { id: 22, name: 'Chance',           type: 'chance' },
  { id: 23, name: 'Goa',              type: 'property', color: 'red',      price: 220,  rent: [18, 90, 250, 700, 875, 1050],  houseCost: 150, group: 'red' },
  { id: 24, name: 'Kochi',            type: 'property', color: 'red',      price: 240,  rent: [20, 100, 300, 750, 925, 1100], houseCost: 150, group: 'red' },
  { id: 25, name: 'Howrah Junction',  type: 'railroad', price: 200, group: 'railroad' },
  { id: 26, name: 'New Delhi',        type: 'property', color: 'yellow',   price: 260,  rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, group: 'yellow' },
  { id: 27, name: 'Shimla',           type: 'property', color: 'yellow',   price: 260,  rent: [22, 110, 330, 800, 975, 1150], houseCost: 150, group: 'yellow' },
  { id: 28, name: 'Jio Digital',      type: 'utility',  price: 150, group: 'utility' },
  { id: 29, name: 'Udaipur',          type: 'property', color: 'yellow',   price: 280,  rent: [24, 120, 360, 850, 1025, 1200],houseCost: 150, group: 'yellow' },
  { id: 30, name: 'Go To Jail',       type: 'gotojail' },

  // Right column (top to bottom): positions 31-39
  { id: 31, name: 'Agra',             type: 'property', color: 'green',    price: 300,  rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, group: 'green' },
  { id: 32, name: 'Mysore',           type: 'property', color: 'green',    price: 300,  rent: [26, 130, 390, 900, 1100, 1275], houseCost: 200, group: 'green' },
  { id: 33, name: 'Karma',            type: 'karma' },
  { id: 34, name: 'Darjeeling',       type: 'property', color: 'green',    price: 320,  rent: [28, 150, 450, 1000, 1200, 1400],houseCost: 200, group: 'green' },
  { id: 35, name: 'Chennai Central',  type: 'railroad', price: 200, group: 'railroad' },
  { id: 36, name: 'Chance',           type: 'chance' },
  { id: 37, name: 'Mumbai',           type: 'property', color: 'darkblue', price: 350,  rent: [35, 175, 500, 1100, 1300, 1500],houseCost: 200, group: 'darkblue' },
  { id: 38, name: 'Luxury Tax',       type: 'tax',      amount: 100 },
  { id: 39, name: 'Delhi',            type: 'property', color: 'darkblue', price: 400,  rent: [50, 200, 600, 1400, 1700, 2000],houseCost: 200, group: 'darkblue' },
];

const CHANCE_CARDS = [
  { text: 'Advance to GO. Collect ₹200!', action: 'moveto', value: 0 },
  { text: 'Your startup got funded! Collect ₹150.', action: 'collect', value: 150 },
  { text: 'Festival bonus! Collect ₹100.', action: 'collect', value: 100 },
  { text: 'Go to Jail. Do not pass GO.', action: 'gotojail' },
  { text: 'Advance to Mumbai Central railway.', action: 'moveto', value: 5 },
  { text: 'Pay hospital bills ₹50.', action: 'pay', value: 50 },
  { text: 'Bank pays you dividend of ₹50.', action: 'collect', value: 50 },
  { text: 'Get out of Jail free card!', action: 'jailfree' },
  { text: 'Go back 3 spaces.', action: 'moveback', value: 3 },
  { text: 'Pay each player ₹50.', action: 'payeach', value: 50 },
  { text: 'Your property taxes are due. Pay ₹150.', action: 'pay', value: 150 },
  { text: 'Advance to Bangalore!', action: 'moveto', value: 21 },
  { text: 'You won a cricket bet! Collect ₹200.', action: 'collect', value: 200 },
  { text: 'Speeding fine ₹15.', action: 'pay', value: 15 },
  { text: 'Advance to Delhi!', action: 'moveto', value: 39 },
  { text: 'You are elected Panchayat head. Pay each player ₹25.', action: 'payeach', value: 25 },
];

const KARMA_CARDS = [
  { text: 'Bank error in your favour. Collect ₹200!', action: 'collect', value: 200 },
  { text: 'Doctor\'s fees. Pay ₹50.', action: 'pay', value: 50 },
  { text: 'From sale of chai franchise, you get ₹50.', action: 'collect', value: 50 },
  { text: 'Get out of Jail free card!', action: 'jailfree' },
  { text: 'Go to Jail. Do not pass GO.', action: 'gotojail' },
  { text: 'Diwali bonus! Collect ₹100.', action: 'collect', value: 100 },
  { text: 'Income tax refund. Collect ₹20.', action: 'pay', value: -20 },
  { text: 'Life insurance matures. Collect ₹100.', action: 'collect', value: 100 },
  { text: 'Pay school fees of ₹50.', action: 'pay', value: 50 },
  { text: 'Receive ₹25 consultancy fee.', action: 'collect', value: 25 },
  { text: 'You inherit ₹100.', action: 'collect', value: 100 },
  { text: 'Street repair costs: ₹40 per house, ₹115 per hotel.', action: 'repair', houseRate: 40, hotelRate: 115 },
  { text: 'You won second prize in a Rangoli contest! Collect ₹10.', action: 'collect', value: 10 },
  { text: 'Advance to GO. Collect ₹200!', action: 'moveto', value: 0 },
  { text: 'Temple donation. Pay ₹50.', action: 'pay', value: 50 },
  { text: 'Wedding gift received. Collect ₹75.', action: 'collect', value: 75 },
];

const PLAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c'];
const PLAYER_TOKENS = ['🚗', '🏍️', '🛺', '✈️', '🚂', '🚀'];

const DEFAULT_SETTINGS = {
  startingCash: 1500,
  goBonus: 200,
  vacationCashEnabled: true,
  vacationCashStart: 500,
  collectRentInJail: true,
  jailBailAmount: 50,
  maxPlayers: 6,
  freeParkingPool: true,
  cashLimit: 0,
};

const COLOR_HEX = {
  brown: '#8B4513',
  lightblue: '#87CEEB',
  pink: '#FF69B4',
  orange: '#FFA500',
  red: '#FF0000',
  yellow: '#FFD700',
  green: '#228B22',
  darkblue: '#00008B',
};

module.exports = {
  BOARD_SPACES,
  CHANCE_CARDS,
  KARMA_CARDS,
  PLAYER_COLORS,
  PLAYER_TOKENS,
  DEFAULT_SETTINGS,
  COLOR_HEX,
};
