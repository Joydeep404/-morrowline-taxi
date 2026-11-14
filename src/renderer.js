import { CITY, nextFuelStation } from "./game.js";

const PALETTE = {
  grass: "#8b9b79",
  grassDark: "#758768",
  road: "#555b58",
  roadEdge: "#dbd3bc",
  curb: "#eee5cf",
  ink: "#28352f"
};

function seeded(index, salt = 0) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function roundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawBackground(context, width, height) {
  context.fillStyle = PALETTE.grass;
  context.fillRect(0, 0, width, height);
  for (let index = 0; index < 1400; index += 1) {
    const x = seeded(index, 41) * width;
    const y = seeded(index, 87) * height;
    const size = 1 + seeded(index, 107) * 2;
    context.fillStyle = index % 3 === 0 ? "rgba(224,225,182,.13)" : "rgba(43,70,53,.075)";
    context.fillRect(x, y, size, size);
  }
}

function drawBlocks(context, sx, sy, scale, shift, district) {
  let buildingIndex = 0;
  const roadsX = [70, ...CITY.verticalRoads, CITY.width - 70];
  const roadsY = [55, ...CITY.horizontalRoads, CITY.height - 55];
  for (let row = 0; row < roadsY.length - 1; row += 1) {
    for (let column = 0; column < roadsX.length - 1; column += 1) {
      const left = roadsX[column] + CITY.roadWidth / 2 + 12;
      const right = roadsX[column + 1] - CITY.roadWidth / 2 - 12;
      const top = roadsY[row] + CITY.roadWidth / 2 + 12;
      const bottom = roadsY[row + 1] - CITY.roadWidth / 2 - 12;
      if (right <= left || bottom <= top) continue;
      const x = sx(left);
      const y = sy(top);
      const width = sx(right) - x;
      const height = sy(bottom) - y;
      context.fillStyle = "rgba(63,84,55,.21)";
      roundedRect(context, x - 3 * scale, y - 3 * scale, width + 6 * scale, height + 6 * scale, 10 * scale);
      context.fill();
      const isPark = (row * 3 + column) % 8 === 5;
      context.fillStyle = isPark ? "#78926d" : "#b5b28d";
      roundedRect(context, x, y, width, height, 7 * scale);
      context.fill();
      if (isPark) {
        drawPark(context, x, y, width, height, scale, row * 7 + column, shift);
      } else {
        drawHouses(context, x, y, width, height, scale, district, buildingIndex);
        buildingIndex += 1;
      }
    }
  }
}

function drawHouses(context, x, y, width, height, scale, district, seedBase) {
  const cols = width > 165 * scale ? 2 : 1;
  const rows = height > 165 * scale ? 2 : 1;
  const gap = 8 * scale;
  const lotW = (width - (cols + 1) * gap) / cols;
  const lotH = (height - (rows + 1) * gap) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const seed = seedBase * 4 + row * 2 + col;
      const insetX = gap + seeded(seed, 6) * lotW * .12;
      const insetY = gap + seeded(seed, 9) * lotH * .1;
      const houseW = lotW * (.68 + seeded(seed, 15) * .22);
      const houseH = lotH * (.66 + seeded(seed, 21) * .24);
      const hx = x + col * (lotW + gap) + insetX;
      const hy = y + row * (lotH + gap) + insetY;
      drawHouse(context, hx, hy, houseW, houseH, scale, district.houses, seed);
    }
  }
}

function drawHouse(context, x, y, width, height, scale, style, seed) {
  const depth = Math.max(2 * scale, Math.min(7 * scale, Math.min(width, height) * .11));
  const wall = ["#d9cdb5", "#cfc2a8", "#ddd0b6", "#c5c6ae"][Math.floor(seeded(seed, 12) * 4)];
  const roof = style === "market" ? "#696a64" : ["#845f50", "#71665d", "#92725c", "#747c70"][Math.floor(seeded(seed, 28) * 4)];
  context.fillStyle = "rgba(39,46,37,.28)";
  roundedRect(context, x + depth, y + depth, width, height, 3 * scale);
  context.fill();
  context.fillStyle = wall;
  roundedRect(context, x, y, width, height, 3 * scale);
  context.fill();
  context.fillStyle = roof;
  roundedRect(context, x - depth * .1, y - depth * .12, width, height, 3 * scale);
  context.fill();
  context.fillStyle = "rgba(240,225,197,.25)";
  context.fillRect(x + width * .12, y + height * .11, width * .76, Math.max(scale, height * .035));
  if (width > 18 * scale && height > 22 * scale) {
    const windowColor = style === "airport" ? "#92968f" : "#64767a";
    context.fillStyle = windowColor;
    const windows = width > 80 * scale ? 3 : 2;
    for (let index = 0; index < windows; index += 1) {
      const wx = x + width * (.2 + index * (.58 / Math.max(1, windows - 1)));
      const wy = y + height * .55;
      context.fillRect(wx - 1.7 * scale, wy - 1.7 * scale, 3.4 * scale, 3.4 * scale);
    }
    context.fillStyle = "#594b3d";
    context.fillRect(x + width * .44, y + height * .69, Math.max(3 * scale, width * .12), height * .28);
  }
  if (style === "market" && width > 45 * scale) {
    context.fillStyle = "#d1a26d";
    context.fillRect(x + width * .08, y + height * .92, width * .84, Math.max(3 * scale, height * .07));
  }
}

function drawPark(context, x, y, width, height, scale, seed, shift) {
  context.strokeStyle = "rgba(220,210,171,.37)";
  context.lineWidth = Math.max(1, 3 * scale);
  context.beginPath();
  context.moveTo(x + width * .1, y + height * .82);
  context.lineTo(x + width * .45, y + height * .45);
  context.lineTo(x + width * .9, y + height * .14);
  context.moveTo(x + width * .2, y + height * .14);
  context.lineTo(x + width * .75, y + height * .84);
  context.stroke();
  for (let index = 0; index < 9; index += 1) {
    const treeX = x + width * (.1 + seeded(index + seed, 31) * .8);
    const treeY = y + height * (.15 + seeded(index + seed, 57) * .7);
    const radius = Math.max(2.4 * scale, 9 * scale + seeded(index, 65) * 5 * scale);
    context.fillStyle = "rgba(40,61,44,.3)";
    context.beginPath();
    context.ellipse(treeX + radius * .15, treeY + radius * .35, radius * 1.05, radius * .82, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ["#536f4c", "#5f7c53", "#678158", "#74885c"][index % 4];
    context.beginPath();
    context.arc(treeX, treeY, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = "rgba(226,224,184,.19)";
    context.beginPath();
    context.arc(treeX - radius * .27, treeY - radius * .28, radius * .31, 0, Math.PI * 2);
    context.fill();
  }
  if (width > 70 * scale) {
    context.fillStyle = "#d8d0b4";
    context.font = `${Math.max(7, 9 * scale)}px sans-serif`;
    context.textAlign = "center";
    context.fillText(shift.districtId === "old-town" ? "SQUARE" : "CITY PARK", x + width / 2, y + height / 2);
  }
}

function drawRoads(context, sx, sy, scale, shift) {
  context.lineCap = "butt";
  context.strokeStyle = "rgba(238,227,201,.7)";
  context.lineWidth = (CITY.roadWidth + 18) * scale;
  for (const x of CITY.verticalRoads) {
    context.beginPath(); context.moveTo(sx(x), sy(0)); context.lineTo(sx(x), sy(CITY.height)); context.stroke();
  }
  for (const y of CITY.horizontalRoads) {
    context.beginPath(); context.moveTo(sx(0), sy(y)); context.lineTo(sx(CITY.width), sy(y)); context.stroke();
  }
  context.strokeStyle = PALETTE.road;
  context.lineWidth = CITY.roadWidth * scale;
  for (const x of CITY.verticalRoads) {
    context.beginPath(); context.moveTo(sx(x), sy(0)); context.lineTo(sx(x), sy(CITY.height)); context.stroke();
  }
  for (const y of CITY.horizontalRoads) {
    context.beginPath(); context.moveTo(sx(0), sy(y)); context.lineTo(sx(CITY.width), sy(y)); context.stroke();
  }
  context.save();
  context.strokeStyle = "rgba(232,222,193,.47)";
  context.lineWidth = Math.max(1, 2 * scale);
  context.setLineDash([12 * scale, 12 * scale]);
  for (const x of CITY.verticalRoads) {
    context.beginPath(); context.moveTo(sx(x), sy(0)); context.lineTo(sx(x), sy(CITY.height)); context.stroke();
  }
  for (const y of CITY.horizontalRoads) {
    context.beginPath(); context.moveTo(sx(0), sy(y)); context.lineTo(sx(CITY.width), sy(y)); context.stroke();
  }
  context.restore();

  context.fillStyle = "#d8cbb0";
  for (const x of CITY.verticalRoads) {
    for (const y of CITY.horizontalRoads) {
      const px = sx(x), py = sy(y);
      const size = 14 * scale;
      context.fillRect(px - size, py - size, size * 2, size * 2);
      context.strokeStyle = "rgba(86,89,80,.52)";
      context.lineWidth = Math.max(1, 2 * scale);
      context.beginPath(); context.moveTo(px - size, py - size); context.lineTo(px + size, py + size); context.stroke();
    }
  }

  drawStreetLabels(context, sx, sy, scale, shift);
}

function drawStreetLabels(context, sx, sy, scale, shift) {
  const streetNames = ["Oak Street", "Pine Avenue", "Market Road", "Station Way", "River Street", "Maple Lane"];
  context.font = `${Math.max(7, 10 * scale)}px sans-serif`;
  context.textAlign = "center";
  for (let index = 0; index < CITY.horizontalRoads.length; index += 1) {
    const y = sy(CITY.horizontalRoads[index]);
    context.fillStyle = "rgba(237,229,207,.8)";
    context.fillText(streetNames[(index + (shift.districtId.length % streetNames.length)) % streetNames.length], sx(CITY.width * .76), y - 8 * scale);
  }
}

function drawCar(context, point, heading, scale, color, isPlayer = false, model = 0) {
  const x = point.x, y = point.y;
  const length = (isPlayer ? 43 : 32 + model * 2) * scale;
  const width = (isPlayer ? 23 : 17 + model) * scale;
  context.save();
  context.translate(x, y);
  context.rotate(heading);
  context.fillStyle = "rgba(34,39,34,.34)";
  roundedRect(context, -length * .5 + 2 * scale, -width * .5 + 3 * scale, length, width, width * .24);
  context.fill();
  context.fillStyle = color;
  roundedRect(context, -length * .5, -width * .5, length, width, width * .24);
  context.fill();
  context.fillStyle = isPlayer ? "#283d42" : "#394950";
  roundedRect(context, -length * .16, -width * .38, length * .43, width * .76, width * .13);
  context.fill();
  context.fillStyle = "#f7e9be";
  context.fillRect(length * .39, -width * .3, 3 * scale, 4 * scale);
  context.fillRect(length * .39, width * .11, 3 * scale, 4 * scale);
  context.fillStyle = "#c87765";
  context.fillRect(-length * .5, -width * .3, 3 * scale, 4 * scale);
  context.fillRect(-length * .5, width * .11, 3 * scale, 4 * scale);
  if (isPlayer) {
    context.fillStyle = "#f4e3a9";
    context.font = `700 ${Math.max(5, 6 * scale)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("TAXI", 0, 0);
    context.strokeStyle = "#fff0bd";
    context.lineWidth = 2 * scale;
    context.beginPath(); context.moveTo(length * .5, 0); context.lineTo(length * .5 + 14 * scale, 0); context.stroke();
  }
  context.restore();
}

function drawPassenger(context, person, sx, sy, scale, selected) {
  const x = sx(person.x), y = sy(person.y);
  const radius = Math.max(6, 10 * scale);
  context.fillStyle = selected ? "rgba(246,199,125,.26)" : "rgba(187,221,194,.4)";
  context.beginPath();
  context.arc(x, y, radius * 1.45, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = selected ? "rgba(250,220,154,.98)" : "rgba(229,247,218,.96)";
  context.lineWidth = Math.max(2, 3 * scale);
  context.beginPath();
  context.arc(x, y, radius * (selected ? 1.7 : 1.25), 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "rgba(24,33,30,.25)";
  context.beginPath(); context.ellipse(x + radius * .3, y + radius * .7, radius * 1.15, radius * .62, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = selected ? "#f0c77d" : "#9bc5a8";
  context.beginPath(); context.arc(x, y - radius * .65, radius * .55, 0, Math.PI * 2); context.fill();
  context.strokeStyle = selected ? "#62462f" : "#385344";
  context.lineWidth = Math.max(2.5, 5 * scale);
  context.lineCap = "round";
  context.beginPath(); context.moveTo(x, y - radius * .15); context.lineTo(x, y + radius * .76); context.stroke();
  context.lineWidth = Math.max(1.5, 3 * scale);
  context.beginPath(); context.moveTo(x, y + radius * .1); context.lineTo(x - radius * .48, y + radius * .48); context.moveTo(x, y + radius * .1); context.lineTo(x + radius * .48, y + radius * .48); context.stroke();
  if (selected) {
    context.fillStyle = "#2d3831";
    roundedRect(context, x + radius * .9, y - radius * 2.6, radius * 8, radius * 2.15, radius * .35);
    context.fill();
    context.fillStyle = "#f3dfb2";
    context.font = `600 ${Math.max(7, 8 * scale)}px sans-serif`;
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.fillText("WAITING", x + radius * 1.25, y - radius * 1.55);
  }
}

function drawFuelStation(context, station, sx, sy, scale) {
  if (!station) return;
  const x = sx(station.x), y = sy(station.y);
  context.fillStyle = "#eee1b6";
  context.beginPath(); context.arc(x, y, Math.max(5, 8 * scale), 0, Math.PI * 2); context.fill();
  context.fillStyle = "#3e5551";
  context.font = `700 ${Math.max(7, 10 * scale)}px sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("F", x, y);
}

function drawCoins(context, coins, sx, sy, scale) {
  for (const coin of coins) {
    const x = sx(coin.x), y = sy(coin.y);
    const radius = Math.max(4, 8 * scale);
    context.fillStyle = "rgba(244,199,99,.24)";
    context.beginPath(); context.arc(x, y, radius * 1.8, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#f3ca6c";
    context.strokeStyle = "#fff0b5";
    context.lineWidth = Math.max(1, 2 * scale);
    context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fill(); context.stroke();
    context.fillStyle = "#72522b";
    context.font = `700 ${Math.max(6, radius * 1.25)}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText("✦", x, y);
  }
}

function drawRoadworks(context, barriers, sx, sy, scale) {
  for (const barrier of barriers) {
    context.save();
    context.translate(sx(barrier.x), sy(barrier.y));
    if (barrier.axis === "horizontal") context.rotate(Math.PI / 2);
    const length = 46 * scale;
    const thickness = Math.max(4, 10 * scale);
    context.fillStyle = "#26312d";
    roundedRect(context, -length / 2, -thickness / 2, length, thickness, Math.max(1, scale * 2));
    context.fill();
    context.save();
    roundedRect(context, -length / 2, -thickness / 2, length, thickness, Math.max(1, scale * 2));
    context.clip();
    context.strokeStyle = "#e9c56f";
    context.lineWidth = Math.max(2, 5 * scale);
    for (let stripe = -length; stripe < length; stripe += 9 * scale) {
      context.beginPath();
      context.moveTo(stripe, thickness);
      context.lineTo(stripe + thickness, -thickness);
      context.stroke();
    }
    context.restore();
    context.fillStyle = "#f0c873";
    for (const side of [-1, 1]) {
      context.beginPath();
      context.arc(side * length / 2, 0, Math.max(2, 4 * scale), 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
}

function drawRoute(context, shift, sx, sy, scale) {
  const target = shift.trip?.status === "to-pickup" ? shift.trip.pickupAt :
    shift.trip?.status === "to-dropoff" ? shift.trip.dropoffAt : null;
  if (!target) return;
  context.save();
  context.strokeStyle = shift.trip.status === "to-pickup" ? "rgba(247,195,112,.82)" : "rgba(155,205,170,.82)";
  context.lineWidth = Math.max(2, 4 * scale);
  context.setLineDash([9 * scale, 7 * scale]);
  const points = [{ x: shift.x, y: shift.y }];
  const nearX = nearest(shift.x, CITY.verticalRoads);
  const nearY = nearest(shift.y, CITY.horizontalRoads);
  const targetX = nearest(target.x, CITY.verticalRoads);
  const targetY = nearest(target.y, CITY.horizontalRoads);
  points.push({ x: nearX, y: shift.y });
  points.push({ x: nearX, y: nearY });
  points.push({ x: targetX, y: nearY });
  points.push({ x: targetX, y: targetY });
  points.push(target);
  context.beginPath();
  context.moveTo(sx(points[0].x), sy(points[0].y));
  for (const point of points.slice(1)) context.lineTo(sx(point.x), sy(point.y));
  context.stroke();
  context.restore();
}

function drawNorth(context, x, y) {
  context.fillStyle = "rgba(35,47,41,.75)";
  roundedRect(context, x - 16, y - 34, 32, 54, 4);
  context.fill();
  context.fillStyle = "#eee2c3";
  context.font = "700 10px sans-serif";
  context.textAlign = "center";
  context.fillText("N", x, y - 20);
  context.beginPath(); context.moveTo(x, y - 11); context.lineTo(x - 6, y + 3); context.lineTo(x, y); context.lineTo(x + 6, y + 3); context.closePath(); context.fill();
}

export function createRoadRenderer(canvas) {
  const context = canvas.getContext("2d", { alpha: false });
  let pixelRatio = 1;
  let width = 0;
  let height = 0;
  let animation = 0;
  const observer = new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(1, bounds.width);
    height = Math.max(1, bounds.height);
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  });
  observer.observe(canvas);

  function draw(shift, district) {
    if (!width || !height) return;
    animation += 1 / 60;
    const { padding, scale, originX, originY, drawnWidth, drawnHeight, sx, sy } = getMapTransform(width, height);

    drawBackground(context, width, height);
    context.save();
    roundedRect(context, originX, originY, drawnWidth, drawnHeight, Math.max(3, 7 * scale));
    context.clip();
    drawBlocks(context, sx, sy, scale, shift, district);
    drawRoads(context, sx, sy, scale, shift);
    drawRoadworks(context, shift.roadworks, sx, sy, scale);
    drawRoute(context, shift, sx, sy, scale);
    const station = nextFuelStation(shift);
    drawFuelStation(context, station, sx, sy, scale);
    drawCoins(context, shift.coins, sx, sy, scale);
    const waiting = shift.passengers.filter((person) => person.state === "waiting" || person.state === "reserved");
    for (const person of waiting) drawPassenger(context, person, sx, sy, scale, person.state === "reserved");
    for (const car of shift.traffic) {
      const point = { x: sx(car.x), y: sy(car.y) };
      const heading = car.axis === "horizontal"
        ? (car.direction > 0 ? 0 : Math.PI)
        : (car.direction > 0 ? Math.PI / 2 : -Math.PI / 2);
      drawCar(context, point, heading, scale, car.color, false, car.model);
    }
    const screenPosition = { x: sx(shift.x), y: sy(shift.y) };
    drawCar(context, screenPosition, shift.heading, scale, "#c8a265", true);
    context.restore();
    context.strokeStyle = "rgba(233,220,191,.45)";
    context.lineWidth = 1;
    roundedRect(context, originX, originY, drawnWidth, drawnHeight, Math.max(3, 7 * scale));
    context.stroke();
    drawNorth(context, width - padding - 19, padding + 28);
    if (shift.status === "stranded") {
      context.fillStyle = "rgba(12,21,24,.34)";
      context.fillRect(0, 0, width, height);
    }
  }

  return { draw, disconnect: () => observer.disconnect() };
}

export function getMapTransform(width, height) {
  const padding = Math.min(22, width * .025);
  const scale = Math.min((width - padding * 2) / CITY.width, (height - padding * 2) / CITY.height);
  const drawnWidth = CITY.width * scale;
  const drawnHeight = CITY.height * scale;
  const originX = (width - drawnWidth) / 2;
  const originY = (height - drawnHeight) / 2;
  return {
    padding, scale, originX, originY, drawnWidth, drawnHeight,
    sx: (x) => originX + x * scale,
    sy: (y) => originY + y * scale
  };
}

function nearest(value, list) {
  return list.reduce((best, item) => Math.abs(item - value) < Math.abs(best - value) ? item : best, list[0]);
}
