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
  limit
} from 'firebase/firestore';

const app = express();
const PORT = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from the internal public folder
const frontendPath = path.join(__dirname, 'public');
app.use(express.static(frontendPath));

// Main Collection reference
const rollsCollection = collection(db, 'yarnRolls');

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
    console.log('\n📦 GET /api/rolls - Fetching all rolls from Firestore');
    const q = query(rollsCollection, orderBy('production_date', 'desc'));
    const querySnapshot = await getDocs(q);

    const rolls = querySnapshot.docs.map(doc => ({
      ...doc.data(),
      firebaseId: doc.id
    }));

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
          console.log(`[Self-Healing] Generating missing QR for ${roll.id}`);
          const { quality_grade: _q, material: _m, ...qrDataObj } = roll;
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
        console.error(`[Self-Healing] Failed to generate QR for ${roll.id}:`, err.message);
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
    const rollDoc = await getDoc(doc(db, 'yarnRolls', rollId));

    if (!rollDoc.exists()) {
      return res.status(404).json({ error: 'Roll not found' });
    }

    res.json(rollDoc.data());
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
      rack_id: rack_id || '',
      state: 'IN STOCK',
      supplier_name: supplier_name || 'ABC Textiles',
      weight: parseFloat(weight) || 25,
      yarn_count: yarn_count || '30s',
      yarn_type: yarn_type || 'Cotton 30s',
      bin: bin || 'B1'
    };

    // 1. Master Record
    await setDoc(doc(db, 'yarnRolls', rollId), rollData);

    // 2. Active Inventory
    await setDoc(doc(db, 'inventory', rollId), rollData);

    // 4. History log
    await logScan(rollId, 'CREATION', 'Registered and added to inventory');

    // 5. Generate QR Code image
    const qrDir = path.join(frontendPath, 'qrcodes');
    const rootQrDir = 'e:/QR/QR_CODES'; // Direct path for Windows reliability

    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
    if (!fs.existsSync(rootQrDir)) fs.mkdirSync(rootQrDir, { recursive: true });

    // We encode a subset of data into the QR code as requested (excluding Material/Grade)
    const { quality_grade: _q, material: _m, ...qrDataObj } = rollData;
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
    const { rollIds, newState } = req.body;
    const capitalizedState = newState.toUpperCase();
    const now = new Date().toISOString();

    await Promise.all(rollIds.map(async (id) => {
      try {
        const rollDocRef = doc(db, 'yarnRolls', id);
        const rollSnap = await getDoc(rollDocRef);

        if (rollSnap.exists()) {
          const rollData = { ...rollSnap.data(), state: capitalizedState, last_state_change: now };

          // 1. Update Master
          await updateDoc(rollDocRef, { state: capitalizedState, last_state_change: now });

          // 2. Collection specific sync
          if (capitalizedState === 'DISPATCHED') {
            await deleteDoc(doc(db, 'inventory', id));
            await deleteDoc(doc(db, 'reserved_collection', id));
            await deleteDoc(doc(db, 'picking_collection', id));
            await setDoc(doc(db, 'deliveries', id), { ...rollData, delivered_at: now });
            await logScan(id, 'DELIVERY', 'Moved to deliveries');
          } else if (capitalizedState === 'RESERVED') {
            await setDoc(doc(db, 'reserved_collection', id), rollData);
            await deleteDoc(doc(db, 'picking_collection', id)); // Cleanup picking if moving back
            await setDoc(doc(db, 'inventory', id), rollData);
            await logScan(id, 'RESERVE', 'Roll reserved for order');
          } else if (capitalizedState === 'PICKED') {
            await setDoc(doc(db, 'picking_collection', id), rollData);
            await deleteDoc(doc(db, 'reserved_collection', id)); // Move from reserved to picking
            await setDoc(doc(db, 'inventory', id), rollData);
            await logScan(id, 'PICK', 'Roll picked for dispatch');
          } else {
            // If moved back to IN STOCK or other states, cleanup specific collections
            if (capitalizedState === 'IN STOCK') {
              await deleteDoc(doc(db, 'reserved_collection', id));
              await deleteDoc(doc(db, 'picking_collection', id));
            }
            await setDoc(doc(db, 'inventory', id), rollData);
            await logScan(id, 'STATE_CHANGE', `State changed to ${capitalizedState}`);
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
    const { customer_name, yarn_type, quantity } = req.body;
    const orderId = `ORD-${Date.now()}`;
    const now = new Date().toISOString();

    const orderData = {
      id: orderId,
      customer_name: customer_name || 'Anonymous Customer',
      yarn_type: yarn_type || 'Cotton 30s',
      quantity: parseInt(quantity) || 1,
      status: 'PENDING',
      createdAt: now,
      approvedAt: null
    };

    await setDoc(doc(db, 'Order_collection', orderId), orderData);

    // 2. Create a notification for the admin
    const notificationId = `NOTIF-${Date.now()}`;
    await setDoc(doc(db, 'notifications', notificationId), {
      id: notificationId,
      userId: 'SYSTEM_ADMIN', // Or a group role
      title: 'New Order Received',
      message: `Customer ${orderData.customer_name} placed an order for ${quantity} rolls of ${yarn_type}.`,
      type: 'ORDER_PENDING',
      orderId: orderId,
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

// 3. Approve Order and reserve rolls
app.post('/api/orders/:id/approve', async (req, res) => {
  try {
    const orderId = req.params.id;
    const orderDocRef = doc(db, 'Order_collection', orderId);
    const orderSnap = await getDoc(orderDocRef);

    if (!orderSnap.exists()) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const orderData = orderSnap.data();
    if (orderData.status !== 'PENDING') {
      return res.status(400).json({ error: 'Order is already processed' });
    }

    // Find "IN STOCK" rolls matching the yarn_type
    const rollsQuery = query(
      collection(db, 'inventory'),
      where('state', '==', 'IN STOCK'),
      where('yarn_type', '==', orderData.yarn_type),
      limit(orderData.quantity)
    );

    const rollsSnap = await getDocs(rollsQuery);
    const matchingRolls = rollsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

    if (matchingRolls.length < orderData.quantity) {
      return res.status(400).json({
        error: 'Insufficient stock',
        available: matchingRolls.length,
        required: orderData.quantity
      });
    }

    // Reserve those rolls
    const now = new Date().toISOString();
    await Promise.all(matchingRolls.map(async (roll) => {
      const rollDocRef = doc(db, 'yarnRolls', roll.id);
      const inventoryDocRef = doc(db, 'inventory', roll.id);

      const updatedRollData = { ...roll, state: 'RESERVED', order_id: orderId, last_state_change: now };

      // Update both collections
      await updateDoc(rollDocRef, { state: 'RESERVED', order_id: orderId, last_state_change: now });
      await updateDoc(inventoryDocRef, { state: 'RESERVED', order_id: orderId, last_state_change: now });

      // Move to reserved_collection
      await setDoc(doc(db, 'reserved_collection', roll.id), updatedRollData);

      // Log it
      await logScan(roll.id, 'AUTO_RESERVE', `Automatically reserved for order ${orderId}`);
    }));

    // Mark order as approved
    await updateDoc(orderDocRef, {
      status: 'APPROVED',
      approvedAt: now,
      assignedRolls: matchingRolls.map(r => r.id)
    });

    res.json({
      success: true,
      message: `Order approved and ${matchingRolls.length} rolls reserved`,
      reservedRolls: matchingRolls.map(r => r.id)
    });
  } catch (error) {
    console.error('Error approving order:', error);
    res.status(500).json({ error: 'Failed to approve order' });
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

    // 3. Reserved Rolls (Exact count of yarns with state = 'RESERVED')
    const reservedQuery = query(rollsCollection, where('state', '==', 'RESERVED'));
    const reservedSnap = await getDocs(reservedQuery);
    const reservedCount = reservedSnap.size;

    res.json({
      pendingCount,
      approvedTodayCount,
      reservedCount
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
      rack_id: rack_id || '',
      state: 'TESTING',
      supplier_name: supplier_name || 'Test Supplier',
      weight: parseFloat(weight) || 0,
      yarn_count: yarn_count || '30s',
      yarn_type: yarn_type || 'Test Yarn',
      bin: bin || 'T1'
    };

    // Save to local JSON file
    const testData = JSON.parse(fs.readFileSync(TEST_QR_FILE, 'utf8'));
    testData.push(rollData);
    fs.writeFileSync(TEST_QR_FILE, JSON.stringify(testData, null, 2));

    // Generate QR Code image
    const qrDir = path.join(frontendPath, 'qrcodes');
    if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });

    const { quality_grade: _q, material: _m, ...qrDataObj } = rollData;
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

    // Get all rolls
    const q = query(rollsCollection);
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

        // Exclude specific fields
        const { quality_grade: _q, material: _m, ...qrDataObj } = roll;
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

