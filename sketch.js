let is_mobile = Math.min(window.screen.width, window.screen.height) < 768 || navigator.userAgent.indexOf("Mobi") > -1;

console.log('is_mobile ' + is_mobile);

console.log(window.screen.width, window.screen.height);

let screen_size = window.innerWidth * window.innerHeight;

const top_border = 60;
const header_text_size = is_mobile ? 42 : 24;

let scoreboard_offset;

let max_mobs;

let run_timer = 0;
let run_start_time = 0;
let win_timer_mark = 0;

const timer_x = 20;
const timer_y = 40;

const win_timer_countdown_total = 5000; // in ms

const max_mob_modifier = 6000;
let winner = -1;
let winner_name = '';
let winner_emoji = '';
let background_alpha = 255;
let mobs;
let explosions = [];
const emoji_size = is_mobile ? 68 : 28;
const explosion_start_size = emoji_size * 1.5;
const explosion_decay = 3;

// size of each mob in pts
const default_entropy = 0.8; // speed at which velocity is degraded
const jitter_chance = 70; // chance to randomly jitter a bit
const jitter_scale = 0.3; // scale of random movement
const hunt_speed = 0.1; // speed of movement towards target
const screen_bounce = 0.5; // how fast to bounce off of screen edge
const screen_padding = emoji_size * 1; // how far away from screen to bounce
const perception_distance = emoji_size * 3; // distance to look for avoiding collisions with friends
const mob_types = [
  { // rock - 0
    emoji: '🪨',
    name: 'Rock',
    beats: [2]
  },
  { // paper - 1
    emoji: '📜',
    name: 'Paper',
    beats: [0]
  },
  { // scissors - 2
    emoji: '✂️',
    name: 'Scissors',
    beats: [1]
  }
]

let game_data = {
  match: 0,
  scores: Array(mob_types.length).fill(0)
}

class Mob {
  constructor(id, x, y, type) {
    this.id = id;
    this.type = type;
    this.pos = createVector(x, y);
    this.delta = createVector(0, 0);
    this.entropy = createVector(default_entropy, default_entropy);
    this.hitbox_x = this.x - emoji_size / 2;
    this.hitbox_y = this.y - emoji_size * 0.85;
    this.current_target = -1;
    this.current_state = 0; // 0 no target, looking. 1 has target. 2 no targets available
  }
  
  draw() {
    textSize(emoji_size);
    text(mob_types[this.type].emoji, this.pos.x, this.pos.y);
  }

  jitter_and_hunt() {
    // jitter a bit
    if (random(0,100) < jitter_chance) {
      let rand_x = random(-0.5, 0.5) * jitter_scale;
      let rand_y = random(-0.5, 0.5) * jitter_scale;
      this.delta.x += rand_x;
      this.delta.y += rand_y;
    }
    // move towards current target (if set)
    switch (this.current_state) {
      case 0: 
        // no target - choose one
        this.current_target = -1;
        this.choose_target();
        break;
      case 1:
        // target locked
        const target = mobs[this.current_target];
        let target_velocity = createVector(target.pos.x - this.pos.x, target.pos.y - this.pos.y);
        target_velocity.normalize();
        this.delta.x += target_velocity.x * hunt_speed;
        this.delta.y += target_velocity.y * hunt_speed;
    }
    // poor-man's flocking separation - keep a small distance from same type mobs
    let friends = [];
    for (let m of mobs) {
      if (m.id == this.id) continue;
      if (m.type == this.type) {
        const friend_distance = this.pos.dist(m.pos);
        if (friend_distance < perception_distance) { // only act on mobs within perception_distance
            friends.push({mob: m, dist: friend_distance});
        }
      }
    }
    // run through the stored list of friends and adjust the delta vector
    for (let f of friends) {
      let buffer_velocity = createVector(f.mob.pos.x - this.pos.x, f.mob.pos.y - this.pos.y);
      buffer_velocity.normalize();
      let diff = p5.Vector.sub(this.pos, f.mob.pos);
      diff.div(f.dist * f.dist);
      this.delta.add(diff);
    }
  }

  choose_target() {
    let targets = [];
    for (let m of mobs) {
      if (m.id == this.id) continue;
      if (m.type != this.type) {
        const target_distance = this.pos.dist(m.pos);
        targets.push({id: m.id, dist: target_distance, type: m.type});
      }
    }
    // `targets` now contains ALL mobs that are not of the same type as `this`
    // find a target to hunt
    const potential_targets = targets.filter((k) => { return mob_types[this.type].beats.includes(k.type) });
    
    if (potential_targets.length > 0) {
      // there is at least one favoured target type - choose the closest one
      const closest_targets = potential_targets.sort((a,b) => { return a.dist - b.dist });
      this.current_state = 1;
      this.current_target = closest_targets[0].id;
    } else {
      // there are no favoured targets to kill
      this.current_state = 2;
      // get the list of potential threats and just jitter for a bit - TODO! make them flee :)
      const potential_friends = targets.filter((k) => { return this.type == k.type });
      // temporarily just stick to the closest friend
      if (potential_friends.length > 0) {
        this.current_target = potential_friends[0].id;
        this.current_state = 1;
      } else {
        this.current_state = 3; // does nothing for now - just float
        this.current_target = -1;
      }
    }
  }


  move() {
    this.pos.add(this.delta);
    if (this.pos.x < screen_padding) this.delta.x += screen_bounce;
    if (this.pos.x > width-screen_padding) this.delta.x -= screen_bounce;
    if (this.pos.y < screen_padding + top_border) this.delta.y += screen_bounce;
    if (this.pos.y > height-screen_padding) this.delta.y -= screen_bounce;
    this.hitbox_x = this.pos.x - emoji_size / 2;
    this.hitbox_y = this.pos.y - emoji_size * 0.85;
  }

  detect_hits() {
    for (let i in mobs) {
      if (i == this.id) continue;
      const ax = this.hitbox_x;
      const ay = this.hitbox_y;
      const bx = mobs[i].hitbox_x;
      const by = mobs[i].hitbox_y;
      const x_overlap = (ax + emoji_size > bx) && (ax < bx + emoji_size);
      const y_overlap = (ay + emoji_size > by) && (ay < by + emoji_size);
      if (x_overlap && y_overlap) {
        // does the current target beat me?
        if (mob_types[mobs[i].type].beats.includes(this.type)) {
          // current mob beats me!
          this.type = mobs[i].type;
          this.emoji = mobs[i].emoji;
          explode_here(this.hitbox_x + emoji_size / 2, this.hitbox_y + emoji_size);
          this.current_state = 0;
          check_for_winners();
        }
        if (mob_types[this.type].beats.includes(mobs[i].type)) {
          mobs[i].type = this.type;
          mobs[i].emoji = this.emoji;
          explode_here(this.hitbox_x + emoji_size / 2, this.hitbox_y + emoji_size);
          this.current_state = 0;
          check_for_winners()
        }
      }
    }
  }

  apply_entropy() {
    this.delta.mult(this.entropy);
  }
}

function explode_here(x, y) {
  explosions.push({
    x: x,
    y: y,
    size: explosion_start_size
  })
}

function draw_explosions() {
  if (explosions.length <= 0) return;
  for (let e in explosions) {
    push();
    textSize(explosions[e].size * 0.75);
    text_colour = color(255);
    // text_colour.setAlpha(explosions[e].size, 0, explosion_start_size, 0, 255);
    fill(text_colour);
    text('💥', explosions[e].x, explosions[e].y);
    pop();
    explosions[e].size -= explosion_decay;
    if (explosions[e].size <= 0) {
      explosions.splice(e,1);
    }
  }
}

function check_for_winners() {
  const mob_types_list = mobs.map((k) => { return k.type});
  let uniques = [...new Set(mob_types_list)];
  if (uniques.length == 1) {
    winner = uniques[0];
    winner_name = mob_types[winner].name;
    winner_emoji = mob_types[winner].emoji;
    // mark the time of the win
    win_timer_mark = run_timer;
    win_timer_countdown = win_timer_countdown_total;
    // increment the score
    game_data.scores[winner] += 1;
    storeItem('game_data', game_data);
  }
}

function windowResized() {
  newsize_x = window.innerWidth;
  newsize_y = window.innerHeight;
  resizeCanvas(newsize_x, newsize_y);
}

function reset_scene() {
  winner = -1;
  winner_name = '';
  winner_emoji = '';
  
  max_mobs = int(screen_size / max_mob_modifier);
  if (is_mobile) {
    max_mobs = int(max_mobs * 0.5);
  }
  // initialize the list of mobs
  mobs = [];
  for (let id = 0; id < max_mobs; id++) {
    x = random(screen_padding, window.innerWidth - screen_padding);
    y = random(screen_padding + top_border, window.innerHeight - screen_padding);
    mob_type = int(random(mob_types.length));
    mob = new Mob(id, x, y, mob_type);
    mobs.push(mob);
  }
  run_timer = 0;
  run_start_time = millis();
}

function preload() {
  reset_scene();
}

function setup() {
  frameRate(60);
  pixelDensity(1);
  createCanvas(window.innerWidth, window.innerHeight);
  windowResized();
  textAlign(CENTER);
  // see if any data is stored in local storage and load it in if present
  loaded_data = getItem('game_data');
  if (loaded_data) {
    game_data = JSON.parse(JSON.stringify(loaded_data));
  } // else, it will be the default values set at the top

  // calculate scoreboard offset
  push();
  textSize(header_text_size);
  scoreboard_offset = textWidth('Rock Paper Scissors');
  pop();
}

function draw() {
  background(29, 57, 102);

  // draw and process the mobs
  for (let mob of mobs) {
    mob.jitter_and_hunt();
    mob.move();
    mob.detect_hits();
    mob.apply_entropy();
    mob.draw();
  }

  draw_explosions();

  if (winner != -1) {
    background(29, 57, 102, 200);
    fill(255);
    if (width < 400) {
      textSize(40);
    } else {
      textSize(60);
    }
    text(`${winner_name} wins! ${winner_emoji}`, width / 2, height / 2);
    push();
    textSize(header_text_size);
    fill(255, 255, 255);
    textAlign(RIGHT);
    win_timer_text = nf(win_timer_mark, 2, 2);
    text(win_timer_text + 's', width - timer_x, timer_y);
    pop();

    // count down the win timer to reset the scene
    win_timer_countdown -= deltaTime;
    if (win_timer_countdown <= 0) {
      reset_scene();
      game_data.match += 1;
      storeItem('game_data', game_data);
    }
    // draw a countdown indicator bar
    push();
    stroke(255);
    strokeWeight(2);
    line(0, top_border, map(win_timer_countdown, win_timer_countdown_total, 0, width, 0), top_border)
    pop();
  } else {
    run_timer = round((millis() - run_start_time) / 1000, 2);
    run_timer_text = nf(run_timer, 2, 2);

    push();
    textSize(header_text_size);
    fill(255, 255, 255, 100);
    textAlign(RIGHT);
    text(run_timer_text + 's', width - timer_x, timer_y);
    pop();
  }

  push();
  textSize(header_text_size);
  fill(255, 255, 255);
  textAlign(LEFT);
  text('Rock Paper Scissors', 10, 40);
  pop();

  push();
  textSize(header_text_size * (is_mobile ? 0.5 : 0.5));
  textAlign(LEFT);
  fill(255, 255, 255);
  scoreboard_text = '';
  for (const mob_type in mob_types) {
    scoreboard_text += mob_types[mob_type].emoji + ' ' + game_data.scores[mob_type] + '  ';
  }
  scoreboard_text += '\n Match # ' + game_data.match;
  text(scoreboard_text, (is_mobile ? 40 : 50) + scoreboard_offset, 30);
  pop();
}
