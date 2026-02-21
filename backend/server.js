import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './firebase.js';
import QRCode from 'qrcode';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
  getDoc,
  setDoc,
  deleteDoc,
  where,
  limit,
  collectionGroup
} from 'firebase/firestore';

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the internal public folder
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// Helper to log actions to scanHistory
async function logScan(rollId, action, details) {
  const scanId = `SCAN-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const scanDoc = doc(db, 'scanHistory', scanId);
  await setDoc(scanDoc, {
    rollId,
    action,
    details,
    timestamp: new Date().toISOString(),
    scannedBy: 'SYSTEM_ADMIN'
  });
}

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Yarn Roll Tracker Backend is running with Firebase' });
});

// Get all rolls
app.get('/api/rolls', async (req, res) => {
  try {
    console.log('\n📦 GET /api/rolls - Fetching all rolls from yarnRolls');
    const q = query(collection(db, 'yarnRolls'), orderBy('production_date', 'desc'));
    const querySnapshot = await getDocs(q);

    let rolls = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      firebaseId: doc.id,
      documentPath: doc.ref.path
    }));

    console.log(`🔍 Found ${rolls.length} rolls in 'yarnRolls' collection.`);

    // SELF-HEALING: If inventory is empty, fetch from potentially unsynced hierarchy or legacy collections
    if (rolls.length === 0) {
      console.log('⚠️ Inventory empty! Triggering deep recovery from hierarchy and legacy...');
      try {
        // 1. Query all rolls in the system via Collection Group
        const groupQuery = query(collectionGroup(db, 'rolls'));
        const groupSnap = await getDocs(groupQuery);
        const hierarchicalRolls = groupSnap.docs.map(doc => ({
          ...doc.data(),
          firebaseId: doc.id,
          documentPath: doc.ref.path
        }));
        console.log(`🛠️ Recovery: Found ${hierarchicalRolls.length} rolls via collectionGroup('rolls').`);

        // 2. Query legacy collection
        const legacySnap = await getDocs(collection(db, 'yarnRolls'));
        const legacyRolls = legacySnap.docs.map(doc => ({
          ...doc.data(),
          firebaseId: doc.id,
          documentPath: doc.ref.path
        }));
        console.log(`🛠️ Recovery: Found ${legacyRolls.length} rolls in legacy 'yarnRolls' collection.`);

        // 3. Merge results (prefer hierarchical/newer data if ID collision occurs)
        const mergedMap = new Map();
        legacyRolls.forEach(r => mergedMap.set(r.id, r));
        hierarchicalRolls.forEach(r => mergedMap.set(r.id, r));

        rolls = Array.from(mergedMap.values());
        console.log(`🛠️ Recovery complete. Total unique rolls found: ${rolls.length}. Restoring...`);

        // Sort in memory (JS) since we couldn't sort in the query
        rolls.sort((a, b) => new Date(b.production_date) - new Date(a.production_date));

        // Background: Repair the inventory collection
        // We don't await this to keep the UI snappy
        (async () => {
          console.log('[Self-Healing] Starting background inventory repopulation...');
          const batchSize = 100;
          for (let i = 0; i < rolls.length; i += batchSize) {
            const chunk = rolls.slice(i, i + batchSize);
            await Promise.all(chunk.map(roll => {
              if (roll.id && !roll.id.includes('test')) {
                return setDoc(doc(db, 'inventory', roll.id), roll);
              }
            }));
          }
          console.log('[Self-Healing] Inventory repaired successfully.');
        })();

      } catch (err) {
        console.error('   ✗ Recovery failed:', err.message);
      }
    }

    console.log(`Total rolls: ${rolls.length}`);

    // Self-healing: Background check for missing QR images
    const qrDir = path.join(frontendPath, 'qrcodes');
    const rootQrDir = 'e:/QR/QR_CODES';
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

    rolls.forEach(async (roll) => {
      try {
        if (!roll.id) return;
        const qrPath = path.join(qrDir, `${roll.id}.png`);

        if (!fs.existsSync(qrPath)) {
          // console.log(`[Self-Healing] Generating missing QR for ${roll.id}`);

          // Prune data for QR encoding
          const {
            quality_grade: _q, material: _m, rawQr: _r, firebaseId: _f, documentPath: _d, createdAt: _c,
            bin: _bin, rack_id: _rack,
            ...qrDataObj
          } = roll;

          await QRCode.toFile(qrPath, JSON.stringify(qrDataObj), {
            color: { dark: '#000000', light: '#ffffff' },
            width: 400
          });
          // Sync to external QR folder
          if (fs.existsSync(rootQrDir)) {
            const rootQrPath = path.join(rootQrDir, `${roll.id}.png`);
            fs.copyFileSync(qrPath, rootQrPath);
          }
        }
      } catch (err) {
        // silent fail for individual QR gen to avoid log spam
      }
    });

    res.json(rolls);
  } catch (error) {
    console.error('Error fetching rolls:', error);
    res.status(500).json({ error: 'Failed to fetch rolls' });
  }
});

// Get single roll by ID (JSON response for QR scans)
app.get('/api/rolls/:id', async (req, res) => {
  try {
    const rollId = req.params.id;
    // Check inventory first for fast lookup
    const invSnap = await getDoc(doc(db, 'inventory', rollId));

    if (invSnap.exists()) {
      return res.json(invSnap.data());
    }

    // Fallback: search hierarchy (useful for newly created hierarchical data not yet in inventory)
    try {
      const q = query(collectionGroup(db, 'rolls'), where('id', '==', rollId), limit(1));
      const snap = await getDocs(q);

      if (!snap.empty) {
        return res.json(snap.docs[0].data());
      }
    } catch (e) {
      console.log('   ℹ️ Hierarchical fallback skipped (index missing or legacy data)');
    }

    res.status(404).json({ error: 'Roll not found' });
  } catch (error) {
    console.error('Error fetching roll:', error);
    res.status(500).json({ error: 'Failed to fetch roll data' });
  }
});

// Helper to generate roll number (simplified since we're in a distributed DB)
function generateRollNumber() {
  const year = new Date().getFullYear();
  const random = Math.floor(100 + Math.random() * 900);
  return `YR-${year}-${random.toString().padStart(3, '0')}`;
}

// Create new roll
app.post('/api/rolls', async (req, res) => {
  try {
    const { yarn_type, weight, rack_id, bin, lot_number, order_id, yarn_count, supplier_name, quality_grade } = req.body;

    console.log('\n➕ POST /api/rolls - Creating new roll with multi-collection sync');

    const rollId = generateRollNumber();
    const now = new Date().toISOString();

    const rollData = {
      id: rollId,
      last_state_change: now,
      lot_number: lot_number || `LOT-GEN-${new Date().getTime().toString().slice(-4)}`,
      order_id: order_id || 'ORD-NONE',
      production_date: now,
      quality_grade: quality_grade || 'A',
      rack_id: rack_id || '1',
      state: 'IN STOCK',
      supplier_name: supplier_name || 'ABC Textiles',
      weight: parseFloat(weight) || 25,
      yarn_count: yarn_count || '30s',
      yarn_type: yarn_type || 'Cotton 30s',
      bin: String(bin || '1').replace(/[Bb]/g, '')
    };

    // 1. Hierarchical Storage: racks/{rack}/bins/{bin}/rolls/{id}
    const rackLabel = String(rack_id || '1').replace(/[Rr]/g, '');
    const binLabel = rollData.bin;

    const rollDocRef = doc(db, 'racks', rackLabel, 'bins', binLabel, 'rolls', rollId);
    await setDoc(rollDocRef, rollData);

    // 2. Legacy/Active Inventory Sync
    await setDoc(doc(db, 'inventory', rollId), rollData);
    await setDoc(doc(db, 'yarnRolls', rollId), rollData);

    // 4. History log
    await logScan(rollId, 'CREATION', `Registered in ${rackLabel} / ${binLabel}`);

    // 5. Generate QR Code image
    const qrDir = path.join(frontendPath, 'qrcodes');
    const rootQrDir = 'e:/QR/QR_CODES'; // Direct path for Windows reliability

    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
    if (!fs.existsSync(rootQrDir)) fs.mkdirSync(rootQrDir, { recursive: true });

    // We encode a subset of data into the QR code as requested
    const {
      quality_grade: _q, material: _m, rawQr: _r, firebaseId: _f, documentPath: _d, createdAt: _c,
      bin: _bin, rack_id: _rack,
      ...qrDataObj
    } = rollData;
    const qrData = JSON.stringify(qrDataObj);

    const qrPath = path.join(qrDir, `${rollId}.png`);
    const rootQrPath = path.join(rootQrDir, `${rollId}.png`);

    await QRCode.toFile(qrPath, qrData, {
      color: { dark: '#000000', light: '#ffffff' },
      width: 400
    });

    // Copy to root directory as requested
    fs.copyFileSync(qrPath, rootQrPath);

    res.status(201).json(rollData);
  } catch (error) {
    console.error('Error creating roll:', error);
    res.status(500).json({ error: 'Failed to create roll' });
  }
});

// Update roll states (bulk operation)
app.post('/api/rolls/update-state', async (req, res) => {
  try {
    const { rollIds, state } = req.body;
    const capitalizedState = state.toUpperCase();
    const now = new Date().toISOString();

    await Promise.all(rollIds.map(async (id) => {
      try {
        // Find the roll in inventory first (authoritative mirror for fast lookup)
        const invDoc = await getDoc(doc(db, 'inventory', id));
        if (invDoc.exists()) {
          const rollData = invDoc.data();
          const masterPath = `racks/${rollData.rack_id || '1'}/bins/${rollData.bin || '1'}/rolls/${id}`;
          const masterRef = doc(db, masterPath);

          const updatedData = { ...rollData, state: capitalizedState, last_state_change: now };

          // 1. Update Hierarchical Master Record (if it exists)
          try {
            await updateDoc(masterRef, { state: capitalizedState, last_state_change: now });
          } catch (e) {
            console.log(`   ℹ️ No master doc at ${masterPath}, skipping nested update.`);
          }

          // 2. Collection specific sync
          if (capitalizedState === 'DISPATCHED') {
            await deleteDoc(doc(db, 'inventory', id));
            await deleteDoc(doc(db, 'reserved_collection', id));
            await deleteDoc(doc(db, 'picking_collection', id));
            await setDoc(doc(db, 'deliveries', id), { ...updatedData, delivered_at: now });
            await logScan(id, 'DELIVERY', 'Moved to deliveries');
          } else if (capitalizedState === 'RESERVED') {
            await setDoc(doc(db, 'reserved_collection', id), updatedData);
            await deleteDoc(doc(db, 'picking_collection', id));
            await setDoc(doc(db, 'inventory', id), updatedData);
            // Update Legacy Sync
            await setDoc(doc(db, 'yarnRolls', id), { ...updatedData, state: capitalizedState }, { merge: true });
            await logScan(id, 'RESERVE', 'Roll reserved for order');
          } else if (capitalizedState === 'PICKED') {
            await setDoc(doc(db, 'picking_collection', id), updatedData);
            await deleteDoc(doc(db, 'reserved_collection', id));
            await setDoc(doc(db, 'inventory', id), updatedData);
            await logScan(id, 'PICK', 'Roll picked for dispatch');
          } else {
            if (capitalizedState === 'IN STOCK') {
              await deleteDoc(doc(db, 'reserved_collection', id));
              await deleteDoc(doc(db, 'picking_collection', id));
            }
            await setDoc(doc(db, 'inventory', id), updatedData);
            await logScan(id, 'STATE_CHANGE', `State changed to ${capitalizedState}`);
          }
        } else {
          // SELF-HEALING: If not in inventory, search hierarchy to find rack/bin for update
          console.log(`   🔍 Roll ${id} not in inventory. searching hierarchy...`);
          const groupQuery = query(collectionGroup(db, 'rolls'), where('id', '==', id), limit(1));
          const groupSnap = await getDocs(groupQuery);

          if (!groupSnap.empty) {
            const rollData = groupSnap.docs[0].data();
            const masterRef = groupSnap.docs[0].ref;
            const updatedData = { ...rollData, state: capitalizedState, last_state_change: now };

            await updateDoc(masterRef, { state: capitalizedState, last_state_change: now });
            await setDoc(doc(db, 'inventory', id), updatedData);
            console.log(`   ✅ Repaired and updated roll ${id}`);
          }
        }
      } catch (err) {
        console.log(`   ✗ Error processing roll ${id}:`, err.message);
      }
    }));

    res.json({ success: true, message: `Synced ${rollIds.length} roll(s) across collections` });
  } catch (error) {
    console.error('Error updating rolls:', error);
    res.status(500).json({ error: 'Failed to update roll states' });
  }
});

// --- NEW ORDER MANAGEMENT COLLECTIONS ---
const ordersCollection = collection(db, 'Order_collection');

// 1. Create a new order
app.post('/api/orders', async (req, res) => {
  try {
    const { customer_name, yarn_type, quantity, items } = req.body;
    const orderId = `ORD-${Date.now()}`;
    const now = new Date().toISOString();

    // Support both single item (legacy) and multi-item format
    let orderItems = [];
    if (items && Array.isArray(items) && items.length > 0) {
      orderItems = items.map(item => ({
        yarn_type: item.yarn_type,
        quantity: parseInt(item.quantity) || 1
      }));
    } else {
      orderItems = [{
        yarn_type: yarn_type || 'Cotton 30s',
        quantity: parseInt(quantity) || 1
      }];
    }

    const orderData = {
      id: orderId,
      customer_name: customer_name || 'Anonymous Customer',
      items: orderItems,
      // Keep legacy fields for partial backward compatibility in UI if needed
      yarn_type: orderItems[0].yarn_type,
      quantity: orderItems[0].quantity,
      status: 'PENDING',
      createdAt: now,
      approvedAt: null
    };

    await setDoc(doc(db, 'Order_collection', orderId), orderData);

    // 2. Create a notification for the admin
    const notificationId = `NOTIF-${Date.now()}`;
    const itemsSummary = orderItems.map(i => `${i.quantity} x ${i.yarn_type}`).join(', ');

    await setDoc(doc(db, 'notifications', notificationId), {
      id: notificationId,
      userId: 'SYSTEM_ADMIN', // Or a group role
      title: 'New Order Received',
      message: `Customer ${orderData.customer_name} placed an order for: ${itemsSummary}.`,
      orderId: orderId,
      type: 'ORDER_PENDING',
      isRead: false,
      createdAt: now
    });

    res.status(201).json(orderData);
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// 2. Get all orders
app.get('/api/orders', async (req, res) => {
  try {
    const q = query(ordersCollection, orderBy('createdAt', 'desc'));
    const querySnapshot = await getDocs(q);
    const orders = querySnapshot.docs.map(doc => doc.data());
    res.json(orders);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/reserved', async (req, res) => {
  try {
    const querySnapshot = await getDocs(collection(db, 'reserved_collection'));
    const reserved = querySnapshot.docs.map(doc => doc.data());
    res.json(reserved);
  } catch (error) {
    console.error('Error fetching reserved collection:', error);
    res.status(500).json({ error: 'Failed to fetch reserved collection' });
  }
});
app.post('/api/orders/:id/approve', async (req, res) => {
  try {
    const orderId = req.params.id;
    console.log(`\n✅ POST /api/orders/${orderId}/approve - Starting approval`);

    const orderDocRef = doc(db, 'Order_collection', orderId);
    const orderSnap = await getDoc(orderDocRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderData = orderSnap.data();
    if (orderData.status !== 'PENDING') {
      return res.status(400).json({ error: `Order is already ${orderData.status.toLowerCase()}` });
    }

    // Support both multi-item and legacy single-item
    const orderItems = orderData.items || [{
      yarn_type: orderData.yarn_type,
      quantity: orderData.quantity
    }];

    console.log(`   Order Info: ${orderData.customer_name} requesting ${orderItems.length} types of yarn.`);

    // Fetch all available rolls once
    const [invSnap, legacySnap] = await Promise.all([
      getDocs(query(collection(db, 'inventory'), where('state', '==', 'IN STOCK'))),
      getDocs(collection(db, 'yarnRolls'))
    ]);

    const mergedMap = new Map();
    invSnap.docs.forEach(d => mergedMap.set(d.id, d.data()));
    legacySnap.docs.forEach(d => {
      const data = d.data();
      const st = String(data.state || '').toUpperCase();
      if (!mergedMap.has(d.id) && (st === 'IN STOCK' || !st || st === 'AVAILABLE')) {
        mergedMap.set(d.id, data);
      }
    });

    let availablePool = Array.from(mergedMap.values()).filter(roll => roll.id && !roll.id.toLowerCase().includes('test'));
    const rollsToReserve = [];
    const missingItems = [];

    for (const item of orderItems) {
      const orderType = String(item.yarn_type || '').toLowerCase().trim();
      const matchingRolls = availablePool.filter(roll => {
        const rollType = String(roll.yarn_type || '').toLowerCase().trim();
        const rollCount = String(roll.yarn_count || '').toLowerCase().trim();
        const combined = `${rollType} ${rollCount}`.trim();

        return rollType === orderType ||
          combined === orderType ||
          combined === orderType.replace(/\s+/g, ' ') ||
          rollType.includes(orderType) ||
          orderType.includes(rollType);
      });

      if (matchingRolls.length < item.quantity) {
        missingItems.push({
          type: item.yarn_type,
          required: item.quantity,
          available: matchingRolls.length
        });
      } else {
        const selected = matchingRolls.slice(0, item.quantity);
        rollsToReserve.push(...selected);
        // Remove selected rolls from pool so they aren't double-counted for another item
        const selectedIds = new Set(selected.map(r => r.id));
        availablePool = availablePool.filter(r => !selectedIds.has(r.id));
      }
    }

    if (missingItems.length > 0) {
      const msg = missingItems.map(m => `${m.type}: needs ${m.required}, has ${m.available}`).join('; ');
      console.log(`   ✗ Insufficient stock for: ${msg}`);
      return res.status(400).json({
        error: `Insufficient stock for some items: ${msg}`,
        missing: missingItems
      });
    }

    // Reserve all selected rolls
    const now = new Date().toISOString();
    await Promise.all(rollsToReserve.map(async (roll) => {
      const masterPath = `racks/${roll.rack_id || '1'}/bins/${roll.bin || '1'}/rolls/${roll.id}`;
      const masterRef = doc(db, masterPath);
      const inventoryDocRef = doc(db, 'inventory', roll.id);
      const updatedRollData = { ...roll, state: 'RESERVED', order_id: orderId, last_state_change: now };

      try { await updateDoc(masterRef, { state: 'RESERVED', order_id: orderId, last_state_change: now }); } catch (e) { }
      await setDoc(inventoryDocRef, { state: 'RESERVED', order_id: orderId, last_state_change: now }, { merge: true });
      try { await setDoc(doc(db, 'yarnRolls', roll.id), { ...updatedRollData, state: 'RESERVED' }, { merge: true }); } catch (e) { }
      await setDoc(doc(db, 'reserved_collection', roll.id), updatedRollData);
      await logScan(roll.id, 'AUTO_RESERVE', `Automatically reserved for order ${orderId}`);
    }));

    await updateDoc(orderDocRef, {
      status: 'APPROVED',
      approvedAt: now,
      assignedRolls: rollsToReserve.map(r => r.id)
    });

    console.log(`   ✅ Order ${orderId} approved successfully`);
    res.json({
      success: true,
      message: `Order approved and ${rollsToReserve.length} rolls reserved`,
      reservedRolls: rollsToReserve.map(r => r.id)
    });
  } catch (error) {
    console.error(`\n❌ Error approving order ${req.params.id}:`, error);
    res.status(500).json({ error: 'Failed to approve order', detail: error.message });
  }
});

// 4. Get Dashboard Stats (Real-time)
app.get('/api/dashboard-stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. Pending Orders
    const pendingQuery = query(ordersCollection, where('status', '==', 'PENDING'));
    const pendingSnap = await getDocs(pendingQuery);
    const pendingCount = pendingSnap.size;

    // 2. Approved Today (Filter in memory to avoid Firestore Index requirement)
    const approvedQuery = query(ordersCollection, where('status', '==', 'APPROVED'));
    const approvedSnap = await getDocs(approvedQuery);
    const approvedTodayCount = approvedSnap.docs.filter(doc => {
      const data = doc.data();
      return data.approvedAt && data.approvedAt >= startOfDay;
    }).length;

    // 3. Reserved Rolls (Query from reserved_collection directly)
    const reservedSnap = await getDocs(collection(db, 'reserved_collection'));
    const reservedCount = reservedSnap.docs.filter(d =>
      String(d.data().state || '').toLowerCase() === 'reserved'
    ).length;

    // 4. Warehouse Breakdown (Racks/Bins)
    const inventorySnap = await getDocs(collection(db, 'inventory'));
    const racksBreakdown = {};

    inventorySnap.docs.forEach(doc => {
      const roll = doc.data();
      if (!roll.id || roll.id.toLowerCase().includes('test')) return;

      const rackId = roll.rack_id || '1';
      const binId = roll.bin || '1';
      const yarnType = roll.yarn_type || 'Unknown';
      const yarnCount = roll.yarn_count || 'N/A';

      if (!racksBreakdown[rackId]) {
        racksBreakdown[rackId] = {
          rack_id: rackId,
          bins: {},
          totalYarns: 0,
          uniqueBinsCount: 0
        };
      }

      if (!racksBreakdown[rackId].bins[binId]) {
        racksBreakdown[rackId].bins[binId] = {
          total: 0,
          stock: {} // Grouped by type and count
        };
        racksBreakdown[rackId].uniqueBinsCount++;
      }

      const stockKey = `${yarnType} | ${yarnCount}`;
      if (!racksBreakdown[rackId].bins[binId].stock[stockKey]) {
        racksBreakdown[rackId].bins[binId].stock[stockKey] = 0;
      }

      racksBreakdown[rackId].bins[binId].stock[stockKey]++;
      racksBreakdown[rackId].bins[binId].total++;
      racksBreakdown[rackId].totalYarns++;
    });

    res.json({
      pendingCount,
      approvedTodayCount,
      reservedCount,
      racksBreakdown: Object.values(racksBreakdown)
    });
  } catch (error) {
    console.error('❌ Error fetching dashboard stats:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard stats', detail: error.message });
  }
});

// 5. Get notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    const notifications = querySnapshot.docs.map(doc => doc.data());
    res.json(notifications);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// --- TESTING QR MANAGEMENT (LOCAL ONLY) ---
const TEST_QR_FILE = path.join(__dirname, 'testing_qrs.json');

// Initialize local test store if not exists
if (!fs.existsSync(TEST_QR_FILE)) {
  fs.writeFileSync(TEST_QR_FILE, JSON.stringify([]));
}

app.post('/api/test-rolls', async (req, res) => {
  try {
    const { yarn_type, weight, rack_id, bin, lot_number, order_id, yarn_count, supplier_name, quality_grade } = req.body;
    console.log('\n🧪 POST /api/test-rolls - Generating TESTING QR (Local Only)');

    const rollId = `TEST - ${Date.now()}`;
    const now = new Date().toISOString();

    const rollData = {
      id: rollId,
      last_state_change: now,
      lot_number: lot_number || 'TEST-LOT',
      order_id: order_id || 'TEST-ORD',
      production_date: now,
      quality_grade: quality_grade || 'T',
      rack_id: rack_id || '1',
      state: 'TESTING',
      supplier_name: supplier_name || 'Test Supplier',
      weight: parseFloat(weight) || 0,
      yarn_count: yarn_count || '30s',
      yarn_type: yarn_type || 'Test Yarn',
      bin: bin || '1'
    };

    // Save to local JSON file
    const testData = JSON.parse(fs.readFileSync(TEST_QR_FILE, 'utf8'));
    testData.push(rollData);
    fs.writeFileSync(TEST_QR_FILE, JSON.stringify(testData, null, 2));

    // Generate QR Code image
    const qrDir = path.join(frontendPath, 'qrcodes');
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

    const {
      quality_grade: _q, material: _m, rawQr: _r, firebaseId: _f, documentPath: _d, createdAt: _c,
      bin: _bin, rack_id: _rack,
      ...qrDataObj
    } = rollData;
    const qrData = JSON.stringify({
      ...qrDataObj,
      isTest: true
    });

    const qrPath = path.join(qrDir, `${rollId}.png`);
    await QRCode.toFile(qrPath, qrData, {
      color: { dark: '#000000', light: '#ffffff' }, // Black QR for testing
      width: 400
    });

    res.status(201).json(rollData);
  } catch (error) {
    console.error('Error creating testing roll:', error);
    res.status(500).json({ error: 'Failed to create testing roll' });
  }
});

app.get('/api/test-rolls', async (req, res) => {
  try {
    const testData = JSON.parse(fs.readFileSync(TEST_QR_FILE, 'utf8'));
    res.json(testData.reverse());
  } catch (error) {
    console.error('Error fetching testing rolls:', error);
    res.status(500).json({ error: 'Failed to fetch testing rolls' });
  }
});

// Delete specific test roll
app.delete('/api/test-rolls/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`\n🗑️ DELETE /api/test-rolls/${id} - Removing testing QR`);

    // 1. Remove from local JSON
    if (fs.existsSync(TEST_QR_FILE)) {
      const testData = JSON.parse(fs.readFileSync(TEST_QR_FILE, 'utf8'));
      const filtered = testData.filter(r => r.id !== id);
      fs.writeFileSync(TEST_QR_FILE, JSON.stringify(filtered, null, 2));
    }

    // 2. Remove QR image
    const qrPath = path.join(frontendPath, 'qrcodes', `${id}.png`);
    if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting test roll:', error);
    res.status(500).json({ error: 'Failed to delete test roll' });
  }
});

// Delete all test rolls
app.delete('/api/test-rolls', async (req, res) => {
  try {
    console.log('\n🗑️ DELETE /api/test-rolls - Clearing ALL testing QRs');

    if (fs.existsSync(TEST_QR_FILE)) {
      const testData = JSON.parse(fs.readFileSync(TEST_QR_FILE, 'utf8'));

      // Remove all associated images
      testData.forEach(roll => {
        const qrPath = path.join(frontendPath, 'qrcodes', `${roll.id}.png`);
        if (fs.existsSync(qrPath)) fs.unlinkSync(qrPath);
      });

      // Clear the file
      fs.writeFileSync(TEST_QR_FILE, JSON.stringify([]));
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error clearing test rolls:', error);
    res.status(500).json({ error: 'Failed to clear test rolls' });
  }
});

// Admin Route: Regenerate Missing QR Codes
app.post('/api/admin/regenerate-qrs', async (req, res) => {
  try {
    console.log('\n🔄 POST /api/admin/regenerate-qrs - Starting bulk regeneration');

    // Generate QRs by scanning all rolls in inventory mirror
    const q = query(collection(db, 'inventory'));
    const querySnapshot = await getDocs(q);
    const rolls = querySnapshot.docs.map(doc => doc.data());

    console.log(`Found ${rolls.length} rolls in database.`);

    const qrDir = path.join(frontendPath, 'qrcodes');
    const rootQrDir = 'e:/QR/QR_CODES';

    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
    if (!fs.existsSync(rootQrDir)) fs.mkdirSync(rootQrDir, { recursive: true });

    let generatedCount = 0;

    for (const roll of rolls) {
      if (!roll.id) continue;

      const qrPath = path.join(qrDir, `${roll.id}.png`);
      const rootQrPath = path.join(rootQrDir, `${roll.id}.png`);

      // Check if file exists (checking both locations to be safe, but primarily the web dir)
      if (!fs.existsSync(qrPath)) {
        console.log(`   Generating missing QR for: ${roll.id}`);

        // Exclude specific fields for compactness
        const {
          quality_grade: _q, material: _m, rawQr: _r, firebaseId: _f, documentPath: _d, createdAt: _c,
          bin: _bin, rack_id: _rack,
          ...qrDataObj
        } = roll;
        const qrData = JSON.stringify(qrDataObj);

        await QRCode.toFile(qrPath, qrData, {
          color: { dark: '#000000', light: '#ffffff' },
          width: 400
        });

        // Also copy to root dir
        fs.copyFileSync(qrPath, rootQrPath);
        generatedCount++;
      }
    }

    console.log(`\n✅ Regeneration complete. Generated ${generatedCount} new QR images.`);
    res.json({ success: true, totalScanned: rolls.length, generated: generatedCount });

  } catch (error) {
    console.error('Error regenerating QRs:', error);
    res.status(500).json({ error: 'Failed to regenerate QRs' });
  }
});

// 5. Delete specific order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    console.log(`\n🗑️ DELETE /api/orders/${id} - Removing order`);
    await deleteDoc(doc(db, 'Order_collection', id));
    res.json({ success: true, message: `Order ${id} deleted` });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({ error: 'Failed to delete order' });
  }
});

// 6. Clear all orders
app.delete('/api/orders', async (req, res) => {
  try {
    console.log(`\n🗑️ DELETE /api/orders - Clearing ALL orders`);
    const q = query(ordersCollection);
    const snap = await getDocs(q);

    await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

    res.json({ success: true, message: `Cleared ${snap.size} orders` });
  } catch (error) {
    console.error('Error clearing orders:', error);
    res.status(500).json({ error: 'Failed to clear orders' });
  }
});

// 7. Settings Management
app.get('/api/settings', async (req, res) => {
  try {
    const rulesSnap = await getDocs(collection(db, 'config', 'inventory_rules', 'rules'));
    const settings = {};
    if (rulesSnap.empty) {
      // Return defaults if collection is empty
      return res.json({
        max_bin_capacity: { value: 30, label: 'Rolls per Bin' },
        bins_per_rack: { value: 10, label: 'Bins per Rack' }
      });
    }
    rulesSnap.forEach(doc => {
      settings[doc.id] = doc.data();
    });
    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

app.post('/api/settings', async (req, res) => {
  try {
    const settings = req.body; // Expecting { rule_id: { value, label, ... } }
    const batch = [];

    for (const [id, data] of Object.entries(settings)) {
      const docRef = doc(db, 'config', 'inventory_rules', 'rules', id);
      batch.push(setDoc(docRef, { ...data, updatedAt: new Date().toISOString() }));
    }

    await Promise.all(batch);
    res.json({ success: true, message: 'Settings updated' });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});
app.delete('/api/rolls/clear-all', async (req, res) => {
  try {
    console.log('\n🗑️ DELETE /api/rolls/clear-all - Clearing TOTAL system data');

    const collectionsToClear = [
      'inventory', 'racks', 'yarnRolls', 'reserved_collection',
      'picking_collection', 'deliveries', 'scanHistory', 'testing_qrs',
      'orders', 'notifications'
    ];

    const deletePromises = [];

    // 1. Clear Standard Collections
    for (const colName of collectionsToClear) {
      try {
        const snap = await getDocs(collection(db, colName));
        snap.docs.forEach(d => deletePromises.push(deleteDoc(d.ref)));
        console.log(`   Clearing ${colName}: Found ${snap.size} docs`);
      } catch (e) {
        console.log(`   ℹ️ Skipping ${colName} (might not exist or empty)`);
      }
    }

    // 2. Hierarchy cleanup (rolls collectionGroup)
    try {
      const rollsSnap = await getDocs(collectionGroup(db, 'rolls'));
      rollsSnap.docs.forEach(d => deletePromises.push(deleteDoc(d.ref)));
      console.log(`   Hierarchy: Found ${rollsSnap.size} rolls to clear`);
    } catch (e) {
      console.log('   ℹ️ Hierarchical cleanup skipped (index missing or already clean)');
    }

    // 3. Wait for all deletions
    if (deletePromises.length > 0) {
      await Promise.all(deletePromises);
    }

    // 4. Wipe Local Files (qrcodes)
    const qrDirs = [
      path.join(frontendPath, 'qrcodes'),
      path.join(frontendPath, 'qrcodes', 'locations'),
      'e:/QR/QR_CODES',
      'e:/QR/LOCATION_QR'
    ];

    qrDirs.forEach(dir => {
      try {
        if (fs.existsSync(dir)) {
          const files = fs.readdirSync(dir);
          files.forEach(file => {
            const filePath = path.join(dir, file);
            if (fs.statSync(filePath).isFile()) {
              fs.unlinkSync(filePath);
            }
          });
          console.log(`   Wiped files in: ${dir}`);
        }
      } catch (e) {
        console.error(`   Error wiping directory ${dir}:`, e.message);
      }
    });

    console.log('[Backend] Global System Reset complete.');
    res.json({ success: true, message: 'Global System Reset: All data and QR codes cleared.' });
  } catch (error) {
    console.error('Error in global system reset:', error);
    res.status(500).json({ error: 'Failed to perform global system reset' });
  }
});

app.post('/api/rolls/bulk', async (req, res) => {
  try {
    const {
      yarn_type, weight, rack_id, start_bin_num, roll_count,
      lot_number, order_id, yarn_count, supplier_name, quality_grade
    } = req.body;

    console.log(`\n📦 Bulk creating ${roll_count} rolls...`);

    // Fetch max capacity from rules collection
    const capacityDoc = await getDoc(doc(db, 'config', 'inventory_rules', 'rules', 'max_bin_capacity'));
    const maxCapacity = capacityDoc.exists() ? (parseInt(capacityDoc.data().value) || 30) : 30;

    let currentBinNum = parseInt(start_bin_num) || 1;
    let rollsCreatedInCurrentBin = 0;
    const now = new Date().toISOString();
    const createdRolls = [];

    // In a real production apps, you'd use a batch, but for simplicity and QR generation, 
    // we'll loop. If roll_count is very high (>100), consider batching.
    for (let i = 0; i < roll_count; i++) {
      // Logic for bin overflow
      if (rollsCreatedInCurrentBin >= maxCapacity) {
        currentBinNum++;
        rollsCreatedInCurrentBin = 0;
        console.log(`   Bin filled. Moving to Bin ${currentBinNum}`);
      }

      const rollId = generateRollNumber();
      const binLabel = `${currentBinNum}`;
      const rackLabel = rack_id || '1';

      const rollData = {
        id: rollId,
        last_state_change: now,
        lot_number: lot_number || `LOT-GEN-${new Date().getTime().toString().slice(-4)}`,
        order_id: order_id || 'ORD-NONE',
        production_date: now,
        quality_grade: quality_grade || 'A',
        rack_id: rackLabel,
        state: 'IN STOCK',
        supplier_name: supplier_name || 'ABC Textiles',
        weight: parseFloat(weight) || 25,
        yarn_count: yarn_count || '30s',
        yarn_type: yarn_type || 'Cotton 30s',
        bin: binLabel,
        createdAt: now
      };

      // Hierarchical Firestore write
      const nestedRef = doc(db, 'racks', rackLabel, 'bins', binLabel, 'rolls', rollId);
      await setDoc(nestedRef, rollData);

      // Inventory keep-sync
      await setDoc(doc(db, 'inventory', rollId), rollData);

      // Legacy Sync (for Dashboard visibility)
      await setDoc(doc(db, 'yarnRolls', rollId), rollData);

      await logScan(rollId, 'BULK_CREATION', `Roll created in ${rackLabel} / ${binLabel}`);

      // QR Generation
      const qrDir = path.join(frontendPath, 'qrcodes');
      const rootQrDir = 'e:/QR/QR_CODES';
      if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
      if (!fs.existsSync(rootQrDir)) fs.mkdirSync(rootQrDir, { recursive: true });

      const { quality_grade: _q, material: _m, ...qrDataObj } = rollData;
      const qrData = JSON.stringify(qrDataObj);
      const qrPath = path.join(qrDir, `${rollId}.png`);
      const rootQrPath = path.join(rootQrDir, `${rollId}.png`);

      await QRCode.toFile(qrPath, qrData, { width: 400 });
      fs.copyFileSync(qrPath, rootQrPath);

      rollsCreatedInCurrentBin++;
      createdRolls.push(rollId);
    }
    res.status(201).json({
      success: true,
      message: `Successfully created ${roll_count} rolls across bins starting from ${start_bin_num}`,
      rollIds: createdRolls
    });
  } catch (error) {
    console.error('Error in bulk creation:', error);
    res.status(500).json({ error: 'Failed to process bulk intake' });
  }
});


// --- 404 HANDLER FOR API ---
app.all('/api/*', (req, res) => {
  res.status(404).json({ error: `API Route Not Found: ${req.method} ${req.url}` });
});

// Fallback to index.html for React Router (Single Page App)
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start server
app.listen(PORT, () => {
  console.log('\n🚀 ═══════════════════════════════════════════════════════');
  console.log('   Yarn Roll Tracking System - Backend Server (FIREBASE)');
  console.log('   ═══════════════════════════════════════════════════════');
  console.log(`   📡 Server running on: http://localhost:${PORT}`);
  console.log('   📊 Database: Firebase Firestore (yarn-roll)');
  console.log('   ✓ CORS enabled for frontend');
  console.log('   ═══════════════════════════════════════════════════════\n');
});

