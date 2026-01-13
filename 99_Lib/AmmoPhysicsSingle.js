// https://github.com/kripken/ammo.js/tree/main

async function AmmoPhysics() {
	let dbgCounter = 0, dbgName = "";
	if ('Ammo' in window === false) {
		console.error('AmmoPhysics: Couldn\'t find Ammo.js');
		return;
	}

	const AmmoLib = await Ammo(); // eslint-disable-line no-undef

	const frameRate = 60;

	const collisionConfiguration = new AmmoLib.btDefaultCollisionConfiguration();
	const dispatcher = new AmmoLib.btCollisionDispatcher(collisionConfiguration);
	const broadphase = new AmmoLib.btDbvtBroadphase();
	const solver = new AmmoLib.btSequentialImpulseConstraintSolver();
	const physicsWorld = new AmmoLib.btDiscreteDynamicsWorld(dispatcher, broadphase, solver, collisionConfiguration);
	physicsWorld.setGravity(new AmmoLib.btVector3(0, - 9.8, 0));

	const worldTransform = new AmmoLib.btTransform();

	function getShape(geometry) {
		const parameters = geometry.parameters;
		// TODO change type to is*
		if (geometry.type === 'BoxGeometry') {
			const sx = parameters.width !== undefined ? parameters.width / 2 : 0.5;
			const sy = parameters.height !== undefined ? parameters.height / 2 : 0.5;
			const sz = parameters.depth !== undefined ? parameters.depth / 2 : 0.5;
			const shape = new AmmoLib.btBoxShape(new AmmoLib.btVector3(sx, sy, sz));
			shape.setMargin(0.05);
			return shape;

		} else if (geometry.type === 'SphereGeometry' || geometry.type === 'IcosahedronGeometry') {
			const radius = parameters.radius !== undefined ? parameters.radius : 1;
			const shape = new AmmoLib.btSphereShape(radius);
			shape.setMargin(0.05);
			return shape;
		}
		return null;
	}

	const visibleMeshes = [];
	const visibleMesh2physicalBodyMap = new WeakMap();

	function addScene(scene) {
		scene.traverse(function (child) {
			if (child.isMesh) {
				const physics = child.userData.physics;
				if (physics) {
					addMesh(child, physics.mass);
				}
			}
		});

	}

	function addMesh(mesh, mass = 0) {
		const shape = getShape(mesh.geometry);
		if (shape !== null) {
			if (mesh.isInstancedMesh) {
				handleInstancedMesh(mesh, mass, shape);
			} else if (mesh.isMesh) {
				handleMesh(mesh, mass, shape);
			}
		}
	}

	function handleMesh(mesh, mass, shape) {
		const position = mesh.position;
		const quaternion = mesh.quaternion;
		const transform = new AmmoLib.btTransform();
		transform.setIdentity();
		transform.setOrigin(new AmmoLib.btVector3(position.x, position.y, position.z));
		transform.setRotation(new AmmoLib.btQuaternion(quaternion.x, quaternion.y, quaternion.z, quaternion.w));
		const motionState = new AmmoLib.btDefaultMotionState(transform);

		const localInertia = new AmmoLib.btVector3(0, 0, 0);
		shape.calculateLocalInertia(mass, localInertia);
		const rbInfo = new AmmoLib.btRigidBodyConstructionInfo(mass, motionState, shape, localInertia);
		const body = new AmmoLib.btRigidBody(rbInfo);
		// body.setFriction( 4 );
		physicsWorld.addRigidBody(body);
		body.threeObject = mesh;
		body.mass = mass;
		if (mass > 0) {
			visibleMeshes.push(mesh);
			visibleMesh2physicalBodyMap.set(mesh, body);
		}
	}


	function setMeshPosition(mesh, position, index = 0) {
		const body = visibleMesh2physicalBodyMap.get(mesh);
		body.setAngularVelocity(new AmmoLib.btVector3(0, 0, 0));
		body.setLinearVelocity(new AmmoLib.btVector3(0, 0, 0));
		worldTransform.setIdentity();
		worldTransform.setOrigin(new AmmoLib.btVector3(position.x, position.y, position.z));
		body.setWorldTransform(worldTransform);
	}

	function setMeshPositionVelocity(mesh, position, velocity, index = 0) {
		console.log("setMeshPositionVelocity", mesh.name, position, velocity, mesh.isInstancedMesh);
		dbgName = mesh.name;
		dbgCounter = 10;
		const body = visibleMesh2physicalBodyMap.get(mesh);
		body.setAngularVelocity(new AmmoLib.btVector3(0, 0, 0));
		body.setLinearVelocity(new AmmoLib.btVector3(velocity.x, velocity.y, velocity.z));
		worldTransform.setIdentity();
		worldTransform.setOrigin(new AmmoLib.btVector3(position.x, position.y, position.z));
		body.setWorldTransform(worldTransform);
		body.activate(true);  // IMPORTANT, otherwise is may be stuck
	}

	function detectCollision() {
		let numManifolds = dispatcher.getNumManifolds();
		for (let i = 0; i < numManifolds; i++) {
			let contactManifold = dispatcher.getManifoldByIndexInternal(i);
			let rb0 = Ammo.castObject(contactManifold.getBody0(), Ammo.btRigidBody);
			let rb1 = Ammo.castObject(contactManifold.getBody1(), Ammo.btRigidBody);
			if (rb0.threeObject.onCollision) rb0.threeObject.onCollision(rb1.threeObject);
			if (rb1.threeObject.onCollision) rb1.threeObject.onCollision(rb0.threeObject);
		}
	}

	let lastTime = 0;

	function step() {
		const time = performance.now();
		if (lastTime > 0) {
			const delta = (time - lastTime) / 1000;

			// Compute Physics
			physicsWorld.stepSimulation(delta, 10);
			for (let i = 0, l = visibleMeshes.length; i < l; i++) {
				const mesh = visibleMeshes[i];
				// get computed coords from physics to visible world
				const physicsBody = visibleMesh2physicalBodyMap.get(mesh);
				const motionState = physicsBody.getMotionState();
				motionState.getWorldTransform(worldTransform);
				const position = worldTransform.getOrigin();
				const quaternion = worldTransform.getRotation();
				mesh.position.set(position.x(), position.y(), position.z());
				mesh.quaternion.set(quaternion.x(), quaternion.y(), quaternion.z(), quaternion.w());
				// if (dbgCounter > 0 && dbgName === mesh.name) {
				// 	console.log(--dbgCounter, dbgName, mesh.position);
				// }
			}
		}
		detectCollision();
		lastTime = time;
	}

	setInterval(step, 1000 / frameRate);

	function togglePhysics(mesh, active) {
		console.log("togglePhysics", mesh.name, active);
		mesh.matrixAutoUpdate = active;
	}

	return {
		addScene,
		addMesh,
		setMeshPosition,
		setMeshPositionVelocity,
		detectCollision,
		togglePhysics
	};

}

function compose(position, quaternion, array, index) {

	const x = quaternion.x(), y = quaternion.y(), z = quaternion.z(), w = quaternion.w();
	const x2 = x + x, y2 = y + y, z2 = z + z;
	const xx = x * x2, xy = x * y2, xz = x * z2;
	const yy = y * y2, yz = y * z2, zz = z * z2;
	const wx = w * x2, wy = w * y2, wz = w * z2;

	array[index + 0] = (1 - (yy + zz));
	array[index + 1] = (xy + wz);
	array[index + 2] = (xz - wy);
	array[index + 3] = 0;

	array[index + 4] = (xy - wz);
	array[index + 5] = (1 - (xx + zz));
	array[index + 6] = (yz + wx);
	array[index + 7] = 0;

	array[index + 8] = (xz + wy);
	array[index + 9] = (yz - wx);
	array[index + 10] = (1 - (xx + yy));
	array[index + 11] = 0;

	array[index + 12] = position.x();
	array[index + 13] = position.y();
	array[index + 14] = position.z();
	array[index + 15] = 1;

}

export { AmmoPhysics };
