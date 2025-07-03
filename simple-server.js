const { createServer } = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 3001;
const host = process.env.HOST || '0.0.0.0';

// Размеры карты
const MAP_WIDTH = 2000;
const MAP_HEIGHT = 1500;

// Препятствия на карте
const obstacles = [
  // Внешние стены
  { x: 0, y: 0, width: MAP_WIDTH, height: 20, type: 'wall' },
  { x: 0, y: MAP_HEIGHT - 20, width: MAP_WIDTH, height: 20, type: 'wall' },
  { x: 0, y: 0, width: 20, height: MAP_HEIGHT, type: 'wall' },
  { x: MAP_WIDTH - 20, y: 0, width: 20, height: MAP_HEIGHT, type: 'wall' },
  
  // Внутренние препятствия
  { x: 300, y: 200, width: 400, height: 30, type: 'wall' },
  { x: 800, y: 300, width: 30, height: 200, type: 'wall' },
  { x: 1200, y: 150, width: 200, height: 30, type: 'wall' },
  { x: 1500, y: 400, width: 30, height: 300, type: 'wall' },
  { x: 500, y: 500, width: 80, height: 80, type: 'block' },
  { x: 700, y: 600, width: 60, height: 60, type: 'block' },
  { x: 1000, y: 800, width: 100, height: 100, type: 'block' },
  { x: 1300, y: 700, width: 90, height: 90, type: 'block' },
  { x: 400, y: 900, width: 70, height: 70, type: 'block' },
  { x: 1600, y: 900, width: 120, height: 80, type: 'block' },
  { x: 200, y: 400, width: 50, height: 50, type: 'bush' },
  { x: 350, y: 600, width: 40, height: 40, type: 'bush' },
  { x: 900, y: 500, width: 60, height: 60, type: 'bush' },
  { x: 1100, y: 600, width: 45, height: 45, type: 'bush' },
  { x: 1400, y: 300, width: 55, height: 55, type: 'bush' },
  { x: 600, y: 1100, width: 50, height: 50, type: 'bush' },
  { x: 1200, y: 1200, width: 65, height: 65, type: 'bush' },
  { x: 300, y: 1300, width: 40, height: 40, type: 'bush' },
  { x: 800, y: 1000, width: 200, height: 30, type: 'wall' },
  { x: 1500, y: 1100, width: 30, height: 150, type: 'wall' },
  { x: 100, y: 800, width: 150, height: 30, type: 'wall' },
];

const gameState = {
  players: new Map(),
  maxPlayers: 8,
  usedNicknames: new Set(),
  weapons: new Map(),
  weaponSpawnInterval: 10000,
  maxWeapons: 8,
  mapWidth: MAP_WIDTH,
  mapHeight: MAP_HEIGHT,
  obstacles: obstacles
};

// Создаем HTTP сервер
const httpServer = createServer((req, res) => {
  let filePath = req.url;
  
  if (filePath === '/') {
    filePath = '/game.html';
  }
  
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };
  
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  
  const searchPaths = ['./public'];
  
  let found = false;
  for (const searchPath of searchPaths) {
    const fullPath = path.join(searchPath, filePath);
    if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
      fs.readFile(fullPath, (err, data) => {
        if (err) {
          res.writeHead(500);
          res.end('Error loading file');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        }
      });
      found = true;
      break;
    }
  }
  
  if (!found) {
    res.writeHead(404);
    res.end('File not found');
  }
});

// Создаем Socket.IO сервер
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Функции коллизий
function checkObstacleCollision(x, y, playerRadius = 15) {
  if (x - playerRadius < 20 || x + playerRadius > MAP_WIDTH - 20 || 
      y - playerRadius < 20 || y + playerRadius > MAP_HEIGHT - 20) {
    return true;
  }
  
  for (let obstacle of obstacles) {
    if (obstacle.type === 'bush') {
      const centerX = obstacle.x + obstacle.width / 2;
      const centerY = obstacle.y + obstacle.height / 2;
      const bushRadius = obstacle.width / 2;
      const distance = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
      
      if (distance < playerRadius + bushRadius) {
        return true;
      }
    } else {
      if (x + playerRadius > obstacle.x && 
          x - playerRadius < obstacle.x + obstacle.width && 
          y + playerRadius > obstacle.y && 
          y - playerRadius < obstacle.y + obstacle.height) {
        return true;
      }
    }
  }
  
  return false;
}

function findValidSpawnPosition() {
  let attempts = 0;
  const maxAttempts = 100;
  
  while (attempts < maxAttempts) {
    const x = Math.random() * (MAP_WIDTH - 100) + 50;
    const y = Math.random() * (MAP_HEIGHT - 100) + 50;
    
    if (!checkObstacleCollision(x, y)) {
      return { x, y };
    }
    attempts++;
  }
  
  return { x: 100, y: 100 };
}

// --- ООП-структура для оружия ---
class Weapon {
  constructor(id, x, y) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = 'sword';
    this.name = 'Меч';
    this.durability = 3;
    this.damage = 2;
    this.range = 80;
  }
  toJSON() {
    // Для сериализации только нужных полей
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      type: this.type,
      name: this.name,
      durability: this.durability,
      damage: this.damage,
      range: this.range
    };
  }
}

class Knife extends Weapon {
  constructor(id, x, y) {
    super(id, x, y);
    this.type = 'knife';
    this.name = 'Нож';
    this.durability = 2;
    this.damage = 1;
    this.range = 50;
  }
}

class GreatSword extends Weapon {
  constructor(id, x, y) {
    super(id, x, y);
    this.type = 'greatsword';
    this.name = 'Двуручный меч';
    this.durability = 5;
    this.damage = 4;
    this.range = 110;
  }
}

// Спавн оружия
function spawnWeapon() {
  if (gameState.weapons.size >= gameState.maxWeapons) return;
  const spawnPos = findValidSpawnPosition();
  const id = `weapon_${Date.now()}_${Math.random()}`;
  // Случайный выбор типа оружия
  const types = [Knife, Weapon, GreatSword];
  const WeaponClass = types[Math.floor(Math.random() * types.length)];
  const weapon = new WeaponClass(id, spawnPos.x, spawnPos.y);

  gameState.weapons.set(weapon.id, weapon);
  io.emit('weaponSpawned', weapon.toJSON());
  console.log('Weapon spawned at:', spawnPos.x, spawnPos.y, weapon.type);
}

// Интервал спавна оружия
setInterval(spawnWeapon, gameState.weaponSpawnInterval);

// Функция для получения топа по киллам
function getKillsLeaderboard() {
  return Array.from(gameState.players.values())
    .filter(player => !player.isDead)
    .sort((a, b) => b.kills - a.kills)
    .slice(0, 10) // Топ 10
    .map((player, index) => ({
      rank: index + 1,
      name: player.name,
      kills: player.kills,
      color: player.color
    }));
}

// Отправка топа всем игрокам каждые 5 секунд
setInterval(() => {
  const leaderboard = getKillsLeaderboard();
  io.emit('leaderboardUpdate', leaderboard);
}, 5000);

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  socket.on('setNickname', (nickname) => {
    if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 20) {
      socket.emit('nicknameError', 'Nickname must be 2-20 characters long');
      return;
    }

    const trimmedNickname = nickname.trim();
    
    if (gameState.usedNicknames.has(trimmedNickname)) {
      socket.emit('nicknameError', 'This nickname is already taken');
      return;
    }

    if (gameState.players.size >= gameState.maxPlayers) {
      socket.emit('nicknameError', 'Server is full');
      return;
    }

    const spawnPos = findValidSpawnPosition();
    const player = {
      id: socket.id,
      x: spawnPos.x,
      y: spawnPos.y,
      color: `hsl(${Math.random() * 360}, 70%, 50%)`,
      name: trimmedNickname,
      rotation: 0,
      health: 10,
      maxHealth: 10,
      isDead: false,
      kills: 0,
      lastActivity: Date.now()
    };

    gameState.players.set(socket.id, player);
    gameState.usedNicknames.add(trimmedNickname);

    socket.emit('gameState', {
      players: Array.from(gameState.players.values()),
      yourId: socket.id,
      obstacles: gameState.obstacles,
      weapons: Array.from(gameState.weapons.values()),
      mapWidth: gameState.mapWidth,
      mapHeight: gameState.mapHeight
    });
    
    // Отправляем текущий топ
    const leaderboard = getKillsLeaderboard();
    socket.emit('leaderboardUpdate', leaderboard);
    
    console.log('Sent gameState to new player:', {
      playersCount: gameState.players.size,
      weaponsCount: gameState.weapons.size,
      weapons: Array.from(gameState.weapons.values()).map(w => ({ id: w.id, x: w.x, y: w.y }))
    });

    socket.broadcast.emit('playerJoined', player);
  });

  socket.on('playerMove', (data) => {
    const player = gameState.players.get(socket.id);
    if (player && !player.isDead) {
      const newX = Math.max(20, Math.min(MAP_WIDTH - 20, data.x));
      const newY = Math.max(20, Math.min(MAP_HEIGHT - 20, data.y));
      
      if (!checkObstacleCollision(newX, newY)) {
        player.x = newX;
        player.y = newY;
        player.lastActivity = Date.now();
        
        io.emit('playerMoved', {
          id: socket.id,
          x: player.x,
          y: player.y
        });
      }
    }
  });
  
  socket.on('playerRotate', (data) => {
    const player = gameState.players.get(socket.id);
    if (player && !player.isDead) {
      player.rotation = data.rotation;
      player.lastActivity = Date.now();
      
      io.emit('playerRotated', {
        id: socket.id,
        rotation: data.rotation
      });
    }
  });

  socket.on('chatMessage', (message) => {
    const player = gameState.players.get(socket.id);
    if (player) {
      io.emit('chatMessage', {
        playerId: socket.id,
        playerName: player.name,
        message: message
      });
    }
  });

  socket.on('pickupWeapon', (weaponId) => {
    const player = gameState.players.get(socket.id);
    const weapon = gameState.weapons.get(weaponId);
    
    console.log('Pickup attempt:', { playerId: socket.id, weaponId, player: player?.name, weapon: weapon?.type });
    
    if (player && weapon && !player.isDead) {
      const distance = Math.sqrt(
        Math.pow(player.x - weapon.x, 2) + Math.pow(player.y - weapon.y, 2)
      );
      
      console.log('Distance to weapon:', distance, 'Player at:', player.x, player.y, 'Weapon at:', weapon.x, weapon.y);
      
      if (distance < 50) { // Увеличил радиус подбора
        console.log('Weapon picked up by:', player.name);
        player.weapon = weapon.toJSON();
        player.lastActivity = Date.now();
        gameState.weapons.delete(weaponId);
        
        console.log('Player weapon after pickup:', player.weapon);
        
        const playerWithWeapon = {
          id: player.id,
          x: player.x,
          y: player.y,
          color: player.color,
          name: player.name,
          rotation: player.rotation,
          health: player.health,
          maxHealth: player.maxHealth,
          isDead: player.isDead,
          weapon: player.weapon
        };
        io.emit('weaponPickedUp', {
          playerId: socket.id,
          weaponId: weaponId,
          player: playerWithWeapon
        });
        io.emit('playerUpdated', {
          playerId: socket.id,
          player: playerWithWeapon
        });

        // Если оружие сломалось, убираем его и отправляем событие
        if (!player.weapon || player.weapon.durability <= 0) {
          delete player.weapon;
          io.emit('weaponBroken', {
            playerId: socket.id,
            player: playerWithWeapon
          });
        }
      } else {
        console.log('Too far to pick up weapon');
      }
    } else {
      console.log('Cannot pick up weapon:', { hasPlayer: !!player, hasWeapon: !!weapon, isDead: player?.isDead });
    }
  });

  socket.on('weaponAttack', () => {
    const player = gameState.players.get(socket.id);
    
    if (player && player.weapon && !player.isDead) {
      player.lastActivity = Date.now();
      
      // Уменьшаем прочность оружия
      player.weapon.durability--;
      
      // Ищем игроков в радиусе атаки
      const attackRange = 80;
      const attackedPlayers = [];
      
      gameState.players.forEach((targetPlayer, targetId) => {
        if (targetId !== socket.id && !targetPlayer.isDead) {
          const distance = Math.sqrt(
            Math.pow(player.x - targetPlayer.x, 2) + Math.pow(player.y - targetPlayer.y, 2)
          );
          
          if (distance < attackRange) {
            const damage = player.weapon.type === 'wooden_sword' ? 2 : 1;
            targetPlayer.health = Math.max(0, targetPlayer.health - damage);
            targetPlayer.lastActivity = Date.now();
            
            attackedPlayers.push({
              id: targetId,
              damage: damage,
              newHealth: targetPlayer.health
            });
            
            // Проверяем смерть
            if (targetPlayer.health <= 0) {
              targetPlayer.isDead = true;
              player.kills++; // Увеличиваем счетчик киллов
              io.emit('playerDied', {
                playerId: targetId,
                killerId: socket.id,
                message: `${player.name} убил ${targetPlayer.name}`,
                player: targetPlayer,
                killerKills: player.kills
              });
            }
          }
        }
      });
      
      // Уведомляем всех об атаке
      io.emit('weaponAttack', {
        attackerId: socket.id,
        attackedPlayers: attackedPlayers
      });
      
      // Формируем актуальное состояние игрока
      let playerWithWeapon;
      if (player.weapon && player.weapon.durability > 0) {
        playerWithWeapon = {
          id: player.id,
          x: player.x,
          y: player.y,
          color: player.color,
          name: player.name,
          rotation: player.rotation,
          health: player.health,
          maxHealth: player.maxHealth,
          isDead: player.isDead,
          weapon: player.weapon
        };
      } else {
        playerWithWeapon = {
          id: player.id,
          x: player.x,
          y: player.y,
          color: player.color,
          name: player.name,
          rotation: player.rotation,
          health: player.health,
          maxHealth: player.maxHealth,
          isDead: player.isDead
        };
      }
      // ВСЕГДА отправляем обновлённого игрока всем
      io.emit('playerUpdated', {
        playerId: socket.id,
        player: playerWithWeapon
      });

      // Если оружие сломалось, убираем его и отправляем событие
      if (!player.weapon || player.weapon.durability <= 0) {
        delete player.weapon;
        io.emit('weaponBroken', {
          playerId: socket.id,
          player: playerWithWeapon
        });
      }
    }
  });

  socket.on('disconnect', () => {
    const player = gameState.players.get(socket.id);
    if (player) {
      console.log('Player disconnected:', player.name);
      gameState.usedNicknames.delete(player.name);
      gameState.players.delete(socket.id);
      socket.broadcast.emit('playerLeft', socket.id);
    }
  });
});

httpServer.listen(port, host, () => {
  console.log(`🎮 WebRog Server running on http://${host}:${port}`);
  console.log(`📱 Open http://localhost:${port} in your browser`);
  console.log(`👥 Max players: ${gameState.maxPlayers}`);
}); 