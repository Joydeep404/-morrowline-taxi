export const DISTRICTS = [
  {
    id: "old-town", name: "Old Town", subtitle: "Narrow streets & corner shops",
    description: "Start with familiar blocks, steady traffic, and a couple of easy-to-spot roadworks.",
    color: "#bc9a71", rideMeters: [900, 1450], fareCentsPerKm: 245, limit: 50, houses: "brick",
    difficulty: "Rookie", deadlineFactor: 1.65, trafficCount: 18,
    objective: { fares: 2, onTimeFares: 1, coins: 1 },
    roadworks: [
      { x: 750, y: 470, axis: "vertical" },
      { x: 900, y: 830, axis: "horizontal" }
    ]
  },
  {
    id: "maple-heights", name: "Maple Heights", subtitle: "Quiet residential avenues",
    description: "Residential streets add more roadworks and a tighter delivery window.",
    color: "#91a47e", rideMeters: [1200, 1950], fareCentsPerKm: 265, limit: 45, houses: "suburb",
    difficulty: "Novice", deadlineFactor: 1.5, trafficCount: 21,
    objective: { fares: 2, onTimeFares: 1, coins: 3 },
    roadworks: [
      { x: 1060, y: 470, axis: "vertical" },
      { x: 750, y: 710, axis: "vertical" },
      { x: 900, y: 830, axis: "horizontal" }
    ]
  },
  {
    id: "riverside", name: "Riverside", subtitle: "The long way by the water",
    description: "Longer waterfront fares, heavier traffic, and several lane closures.",
    color: "#7fa7a9", rideMeters: [1500, 2300], fareCentsPerKm: 295, limit: 60, houses: "river",
    difficulty: "Skilled", deadlineFactor: 1.38, trafficCount: 24,
    objective: { fares: 3, onTimeFares: 2, coins: 4 },
    roadworks: [
      { x: 1370, y: 470, axis: "vertical" },
      { x: 750, y: 950, axis: "vertical" },
      { x: 900, y: 590, axis: "horizontal" },
      { x: 1210, y: 830, axis: "horizontal" }
    ]
  },
  {
    id: "market-district", name: "Market District", subtitle: "Crowds, storefronts & signals",
    description: "Dense traffic and five work zones demand careful lane changes and quick pickups.",
    color: "#c49671", rideMeters: [1300, 2150], fareCentsPerKm: 330, limit: 40, houses: "market",
    difficulty: "Expert", deadlineFactor: 1.28, trafficCount: 28,
    objective: { fares: 3, onTimeFares: 2, coins: 5 },
    roadworks: [
      { x: 1370, y: 710, axis: "vertical" },
      { x: 1060, y: 950, axis: "vertical" },
      { x: 750, y: 230, axis: "vertical" },
      { x: 1210, y: 590, axis: "horizontal" },
      { x: 590, y: 830, axis: "horizontal" }
    ]
  },
  {
    id: "airport-road", name: "Airport Road", subtitle: "Express lanes & terminal hotels",
    description: "The longest fares, busiest traffic, six construction zones, and the shortest deadline cushion.",
    color: "#a6a7bd", rideMeters: [1900, 2900], fareCentsPerKm: 375, limit: 75, houses: "airport",
    difficulty: "Master", deadlineFactor: 1.18, trafficCount: 32,
    objective: { fares: 4, onTimeFares: 3, coins: 6 },
    roadworks: [
      { x: 1370, y: 950, axis: "vertical" },
      { x: 1060, y: 230, axis: "vertical" },
      { x: 750, y: 710, axis: "vertical" },
      { x: 1210, y: 350, axis: "horizontal" },
      { x: 900, y: 1070, axis: "horizontal" },
      { x: 590, y: 590, axis: "horizontal" }
    ]
  }
];

export const GARAGE_ITEMS = [
  { id: "engine-tune", name: "Performance engine", coinCost: 12, description: "Raises acceleration and top speed so you can make tighter delivery windows." },
  { id: "eco-tune", name: "Economy tune", coinCost: 8, description: "Cuts fuel use by 40%, stretching every tank farther." },
  { id: "long-range-tank", name: "Long-range tank", coinCost: 14, description: "Adds 20 litres of capacity and fills the new tank section." },
  { id: "safety-tyres", name: "All-weather tyres", coinCost: 6, description: "More forgiving handling; roadwork and traffic collisions do less damage." },
  { id: "comfort-cabin", name: "Comfort cabin", coinCost: 8, description: "Passengers tip 10% more for a clean, comfortable ride." }
];
