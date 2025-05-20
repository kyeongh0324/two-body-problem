document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('simulationCanvas');
    if (!canvas) {
        console.error("HTML에서 'simulationCanvas' ID를 가진 canvas 요소를 찾을 수 없습니다!");
        return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error("2D rendering context를 가져올 수 없습니다.");
        return;
    }

    const kickAngleSlider = document.getElementById('kickAngle');
    const kickAngleValueDisplay = document.getElementById('kickAngleValue');
    const kickMagnitudeSlider = document.getElementById('kickMagnitude');
    const kickMagnitudeValueDisplay = document.getElementById('kickMagnitudeValue');
    const applyKickButton = document.getElementById('applyKickButton');
    const resetButton = document.getElementById('resetButton');

    if (!kickAngleSlider || !kickAngleValueDisplay || !kickMagnitudeSlider || !kickMagnitudeValueDisplay || !applyKickButton || !resetButton) {
        console.error("HTML에서 컨트롤 UI 요소를 모두 찾을 수 없습니다. ID를 확인하세요.");
        return;
    }

    canvas.width = 800;
    canvas.height = 600;

    // --- 상수 ---
    const SIM_G = 3700; // 만유인력 상수 (이 이름을 사용해야 합니다)
    const DT = 0.01;    
    const M1_MASS = 1000; 
    const M2_MASS = 1;    
    const M1_RADIUS = 20; 
    const M2_RADIUS = 5;  
    const M1_COLOR = 'yellow';
    const M2_COLOR = 'deepskyblue'; 
    const INITIAL_ORBIT_COLOR = 'rgba(128, 128, 128, 0.7)';
    const TRAIL_COLOR = 'rgba(0, 191, 255, 0.8)'; 
    const MAX_TRAIL_LENGTH = 1000; 
    const INITIAL_M2_DISTANCE = 150;
    const KICK_ARROW_DURATION = 1000; 
    const KICK_ARROW_LENGTH = 40; 
    const KICK_ARROW_COLOR = 'orange';

    let m1, m2;
    let m2Trail = [];
    let animationFrameId = null;
    let isPaused = false;
    let kickArrowState = { active: false, dir: null, endTime: 0 }; // 여기에 정의

    kickMagnitudeSlider.min = "0";
    kickMagnitudeSlider.max = "50"; 
    kickMagnitudeSlider.step = "0.5";
    kickMagnitudeSlider.value = "5.0"; 

    class Vector {
        constructor(x, y) { this.x = x; this.y = y; }
        add(v) { return new Vector(this.x + v.x, this.y + v.y); }
        sub(v) { return new Vector(this.x - v.x, this.y - v.y); }
        mult(scalar) { return new Vector(this.x * scalar, this.y * scalar); }
        mag() { return Math.sqrt(this.x * this.x + this.y * this.y); }
        norm() {
            const m = this.mag();
            return m === 0 ? new Vector(0, 0) : new Vector(this.x / m, this.y / m);
        }
        static fromAngle(angleRad, magnitude) {
            return new Vector(magnitude * Math.cos(angleRad), magnitude * Math.sin(angleRad));
        }
    }

    function setupInitialConditions() {
        console.log("Setting up initial conditions...");
        isPaused = false; 
        m2Trail = []; 
        kickArrowState.active = false;

        m1 = {
            mass: M1_MASS,
            radius: M1_RADIUS,
            color: M1_COLOR,
            pos: new Vector(canvas.width / 2, canvas.height / 2),
            vel: new Vector(0, 0) 
        };
        
        m2 = {
            mass: M2_MASS,
            radius: M2_RADIUS,
            color: M2_COLOR,
            pos: new Vector(m1.pos.x + INITIAL_M2_DISTANCE, m1.pos.y),
            vel: new Vector(0, 0)
        };

        const rVec = m2.pos.sub(m1.pos);
        const rMag = rVec.mag();
        if (rMag === 0) {
            console.error("Initial distance between M1 and M2 is zero!");
            m2.vel = new Vector(0,0);
            isPaused = true; 
            return;
        }
        const orbitalSpeedScalar = Math.sqrt((SIM_G * m1.mass) / rMag); // SIM_G 사용
        m2.vel = new Vector(0, -orbitalSpeedScalar); 
        console.log(`M2 Initialized: pos=(${m2.pos.x.toFixed(2)}, ${m2.pos.y.toFixed(2)}), vel=(${m2.vel.x.toFixed(2)}, ${m2.vel.y.toFixed(2)})`);
    }

    function applyKick() {
        if (isPaused) {
            alert("일시정지 중에는 힘을 적용할 수 없습니다. 스페이스바로 재개하세요.");
            return;
        }
        if (!m2) {
            console.error("M2 is not initialized. Cannot apply kick.");
            return;
        }

        const kickAngleRad = parseFloat(kickAngleSlider.value) * Math.PI / 180;
        const kickMagnitude = parseFloat(kickMagnitudeSlider.value);
        
        const kickDeltaV = Vector.fromAngle(kickAngleRad, kickMagnitude);
        m2.vel = m2.vel.add(kickDeltaV);
      
        m2Trail = []; 
        
        kickArrowState.active = true;
        kickArrowState.dir = kickDeltaV.norm(); 
        kickArrowState.endTime = Date.now() + KICK_ARROW_DURATION;

        console.log(`Kick applied: angle=${kickAngleSlider.value}°, mag=${kickMagnitude}, new vel=(${m2.vel.x.toFixed(2)}, ${m2.vel.y.toFixed(2)})`);
    }
    
    function drawArrow(ctx, fromX, fromY, dirX, dirY, length, color, lineWidth = 2) {
        const toX = fromX + dirX * length;
        const toY = fromY + dirY * length;
        const headLength = Math.min(length * 0.3, 10); 
        const angle = Math.atan2(toY - fromY, toX - fromX);
    
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle - Math.PI / 6), toY - headLength * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - headLength * Math.cos(angle + Math.PI / 6), toY - headLength * Math.sin(angle + Math.PI / 6));
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.closePath();
    }

    function updatePhysics() {
        if (!m1 || !m2) return;

        const forceVec = m1.pos.sub(m2.pos); 
        const distSq = forceVec.mag() * forceVec.mag();
        
        if (distSq < (m1.radius + m2.radius)*(m1.radius + m2.radius) * 0.8) {
            console.warn("Collision detected or objects too close!");
            isPaused = true; 
            return;
        }
        if (distSq === 0) {
            console.error("Distance between objects is zero, stopping physics update.");
            isPaused = true;
            return;
        }

        // --- 여기가 수정된 부분 ---
        const forceMag = (SIM_G * m1.mass * m2.mass) / distSq; // G -> SIM_G 로 수정
        // -------------------------

        const gravityForce = forceVec.norm().mult(forceMag);
        const accelerationM2 = gravityForce.mult(1 / m2.mass);

        m2.vel = m2.vel.add(accelerationM2.mult(DT));
        m2.pos = m2.pos.add(m2.vel.mult(DT));

        m2Trail.push({ x: m2.pos.x, y: m2.pos.y });
        if (m2Trail.length > MAX_TRAIL_LENGTH) {
            m2Trail.shift();
        }
    }

    function draw() {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        if (!m1 || !m2) { 
             ctx.fillStyle = 'gray';
             ctx.font = '20px Arial';
             ctx.textAlign = 'center';
             ctx.fillText('시뮬레이션 객체 초기화 중...', canvas.width / 2, canvas.height / 2);
            return;
        }
        
        ctx.beginPath();
        ctx.arc(m1.pos.x, m1.pos.y, INITIAL_M2_DISTANCE, 0, Math.PI * 2);
        ctx.strokeStyle = INITIAL_ORBIT_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]); 
        ctx.stroke();
        ctx.setLineDash([]); 

        ctx.beginPath();
        ctx.arc(m1.pos.x, m1.pos.y, m1.radius, 0, Math.PI * 2);
        ctx.fillStyle = m1.color;
        ctx.fill();
        ctx.closePath();

        ctx.beginPath();
        ctx.arc(m2.pos.x, m2.pos.y, m2.radius, 0, Math.PI * 2);
        ctx.fillStyle = m2.color;
        ctx.fill();
        ctx.closePath();

        if (m2Trail.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = TRAIL_COLOR;
            ctx.lineWidth = 1.5;
            ctx.moveTo(m2Trail[0].x, m2Trail[0].y);
            for (let i = 1; i < m2Trail.length; i++) {
                ctx.lineTo(m2Trail[i].x, m2Trail[i].y);
            }
            ctx.stroke();
            ctx.closePath();
        }
        
        if (kickArrowState.active) {
            if (Date.now() < kickArrowState.endTime) {
                drawArrow(ctx, m2.pos.x, m2.pos.y, 
                          kickArrowState.dir.x, kickArrowState.dir.y, 
                          KICK_ARROW_LENGTH, KICK_ARROW_COLOR, 3);
            } else {
                kickArrowState.active = false; 
            }
        }
    }

    function simulationLoop() {
        if (!isPaused) {
            updatePhysics();
        }
        draw();
        animationFrameId = requestAnimationFrame(simulationLoop);
    }
    
    function startSimulation() {
        console.log("Attempting to start simulation...");
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            console.log("Previous animation frame cancelled.");
        }
        setupInitialConditions(); 
        if (m1 && m2) { 
            simulationLoop(); 
            console.log("Simulation loop started.");
        } else {
            console.error("Failed to initialize m1 or m2 in setup. Simulation not starting.");
        }
    }

    kickAngleSlider.addEventListener('input', (e) => {
        kickAngleValueDisplay.textContent = e.target.value;
    });
    kickMagnitudeSlider.addEventListener('input', (e) => {
        kickMagnitudeValueDisplay.textContent = e.target.value;
    });
    
    applyKickButton.addEventListener('click', applyKick);
    resetButton.addEventListener('click', startSimulation);

    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault(); 
            isPaused = !isPaused;
            console.log(`Simulation ${isPaused ? 'Paused' : 'Resumed'}`);
        }
    });

    kickAngleValueDisplay.textContent = kickAngleSlider.value;
    kickMagnitudeValueDisplay.textContent = kickMagnitudeSlider.value;
    
    console.log("Script loaded. Starting simulation...");
    startSimulation();
});