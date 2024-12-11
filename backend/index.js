const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database configuration
const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'lanchez_2019_db',
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 0
});


/* Members */
app.get('/api/members/:phoneNumber', async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const { phoneNumber } = req.params;
    
    // Get member data
    const [members] = await connection.query(
      'SELECT * FROM members WHERE phoneNumber = ?',
      [phoneNumber]
    );

    if (!members.length) {
      return res.status(404).json({
        status: 'error',
        message: 'Member not found'
      });
    }

    const member = members[0];
    const memberStats = await getMemberStats(connection);

    // Get recent transactions
    const [recentTransactions] = await connection.query(
      `SELECT * FROM transactions 
       WHERE memberId = ? 
       ORDER BY createdAt DESC 
       LIMIT 5`,
      [member.id]
    );

    // Get monthly contributions
    const [monthlyContributions] = await connection.query(
      `SELECT 
         DATE_FORMAT(month, '%b') as month,
         amount 
       FROM monthly_contributions 
       WHERE memberId = ? 
       ORDER BY month DESC 
       LIMIT 12`,
      [member.id]
    );

    const responseData = {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      phoneNumber: member.phoneNumber,
      position: member.position,
      balance: member.balance,
      profilePic: member.profilePic,
      treasurerPhone: '0705185868',
      defaultedAmount: (memberStats.totalMembers * 50) - (memberStats.paidThisMonth * 50),
      treasuryBalance: memberStats.totalBalance,
      memberCount: memberStats.totalMembers,
      registeredMembers: memberStats.registeredMembers,
      pendingRegistrations: memberStats.pendingRegistrations,
      recentTransactions: recentTransactions,
      monthlyContributions: monthlyContributions
    };

    res.json({
      status: 'success',
      data: responseData
    });
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch member data'
    });
  } finally {
    connection.release();
  }
});



// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Authentication Middleware
const authenticateTreasurer = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required'
      });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const [treasurers] = await pool.query(
      'SELECT id, firstName, lastName, phoneNumber, position FROM treasurers WHERE id = ?',
      [decoded.id]
    );

    if (!treasurers.length) {
      throw new Error('Treasurer not found');
    }

    req.treasurer = treasurers[0];
    next();
  } catch (error) {
    res.status(401).json({
      status: 'error',
      message: 'Invalid or expired token'
    });
  }
};

// Treasurer Authentication Routes
app.post('/api/treasurer/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Validate input
    if (!phoneNumber || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number and password are required'
      });
    }

    // Check if treasurer exists
    const [treasurers] = await pool.query(
      'SELECT * FROM treasurers WHERE phoneNumber = ?',
      [phoneNumber]
    );

    if (!treasurers.length) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    const treasurer = treasurers[0];

    // Verify password
    const isValid = await bcrypt.compare(password, treasurer.password);
    if (!isValid) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: treasurer.id, position: treasurer.position },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Remove password from treasurer object
    delete treasurer.password;

    res.json({
      status: 'success',
      data: {
        treasurer,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

app.post('/api/treasurer/register', async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, password, position } = req.body;

    // Validate input
    if (!firstName || !lastName || !phoneNumber || !password || !position) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required'
      });
    }

    // Check if phone number already exists
    const [existing] = await pool.query(
      'SELECT id FROM treasurers WHERE phoneNumber = ?',
      [phoneNumber]
    );

    if (existing.length) {
      return res.status(400).json({
        status: 'error',
        message: 'Phone number already registered'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert new treasurer
    const [result] = await pool.query(
      `INSERT INTO treasurers (firstName, lastName, phoneNumber, password, position)
       VALUES (?, ?, ?, ?, ?)`,
      [firstName, lastName, phoneNumber, hashedPassword, position]
    );

    res.status(201).json({
      status: 'success',
      message: 'Treasurer registered successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});


app.get('/api/debug/member-count', async (req, res) => {
  try {
    const [result] = await pool.query('SELECT COUNT(*) as count FROM members');
    res.json({
      totalCount: result[0].count,
      rawResult: result[0]
    });
  } catch (error) {
    console.error('Debug count error:', error);
    res.status(500).json({ error: error.message });
  }
});


// Treasurer Dashboard Routes
app.get('/api/treasurer/dashboard-stats', authenticateTreasurer, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const memberStats = await getMemberStats(connection);

     // Get member count with explicit count query
     const [memberCount] = await connection.query(
      'SELECT COUNT(*) as total FROM members'
    );
    console.log('Member count result:', memberCount[0]);
    
    // Get monthly contributions
    const [monthlyContributions] = await connection.query(`
      SELECT 
        DATE_FORMAT(month, '%Y-%m') as monthYear,
        COUNT(*) as contributingMembers,
        SUM(amount) as totalAmount
      FROM monthly_contributions
      WHERE status = 'paid'
      AND month >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY monthYear
      ORDER BY monthYear DESC
      LIMIT 12
    `);

    // Get recent transactions
    const [recentTransactions] = await connection.query(`
      SELECT t.*, m.firstName, m.lastName, m.phoneNumber
      FROM transactions t
      JOIN members m ON t.memberId = m.id
      ORDER BY t.createdAt DESC
      LIMIT 10
    `);


    res.json({
      status: 'success',
      data: {
        stats: {
          totalBalance: memberStats.totalBalance || 0,
          monthlyContributions: monthlyContributions[0]?.totalAmount || 0,
          pendingPayments: memberStats.totalMembers * 50 - (memberStats.paidThisMonth * 50),
          totalMembers: memberCount[0].total || 0,
          registeredMembers: memberStats.registeredMembers,
          pendingRegistrations: memberStats.pendingRegistrations,
          paidThisMonth: memberStats.paidThisMonth
        },
        transactions: recentTransactions,
        contributionStats: monthlyContributions
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch dashboard statistics'
    });
  } finally {
    connection.release();
  }
});


//Contribution endpoint for each member
app.post('/api/treasurer/contribution', authenticateTreasurer, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { memberId, amount, type, purpose } = req.body;
    const treasurerId = req.treasurer.id;

    // Create transaction record
    const [transaction] = await connection.query(
      `INSERT INTO transactions (memberId, type, amount, purpose, status, treasurerId)
       VALUES (?, ?, ?, ?, 'completed', ?)`,
      [memberId, type, amount, purpose, treasurerId]
    );

    // Update member balance
    await connection.query(
      `UPDATE members 
       SET balance = balance + ?
       WHERE id = ?`,
      [amount, memberId]
    );

    // Record monthly contribution
    await connection.query(
      `INSERT INTO monthly_contributions (memberId, amount, month, status, transactionId)
       VALUES (?, ?, CURRENT_DATE, 'paid', ?)`,
      [memberId, amount, transaction.insertId]
    );

    // Create notification
    await connection.query(
      `INSERT INTO notifications (memberId, message, type)
       VALUES (?, ?, ?)`,
      [
        memberId,
        `Monthly contribution of KES ${amount} received`,
        'success'
      ]
    );

    await connection.commit();

    res.json({
      status: 'success',
      message: 'Contribution recorded successfully',
      data: {
        transactionId: transaction.insertId
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Contribution error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to record contribution'
    });
  } finally {
    connection.release();
  }
});


// Transaction Routes
app.post('/api/treasurer/transaction', authenticateTreasurer, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { memberId, type, amount, purpose } = req.body;
    const treasurerId = req.treasurer.id;

    // Validate transaction
    if (type === 'withdrawal') {
      const [memberBalance] = await connection.query(
        'SELECT balance FROM members WHERE id = ?',
        [memberId]
      );

      if (memberBalance[0].balance < amount) {
        throw new Error('Insufficient balance');
      }
    }

    // Create transaction record
    const [transaction] = await connection.query(
      `INSERT INTO transactions (memberId, type, amount, purpose, status, treasurerId)
       VALUES (?, ?, ?, ?, 'completed', ?)`,
      [memberId, type, amount, purpose, treasurerId]
    );

    // Update member balance
    await connection.query(
      `UPDATE members 
       SET balance = balance ${type === 'deposit' ? '+' : '-'} ?
       WHERE id = ?`,
      [amount, memberId]
    );

    // If it's a monthly contribution, update the contribution record
    if (purpose === 'monthly') {
      await connection.query(
        `INSERT INTO monthly_contributions (memberId, amount, month, status, transactionId)
         VALUES (?, ?, CURRENT_DATE, 'paid', ?)`,
        [memberId, amount, transaction.insertId]
      );
    }

    // Log treasury change
    await connection.query(
      `INSERT INTO treasury_logs (transactionId, previousBalance, newBalance, 
        changeAmount, changeType, treasurerId)
       SELECT ?, 
         (SELECT COALESCE(SUM(balance), 0) FROM members) - ?,
         (SELECT COALESCE(SUM(balance), 0) FROM members),
         ?, ?, ?`,
      [
        transaction.insertId,
        type === 'deposit' ? amount : -amount,
        amount,
        type === 'deposit' ? 'increase' : 'decrease',
        treasurerId
      ]
    );

    // Create notification
    await connection.query(
      `INSERT INTO notifications (memberId, message, type)
       VALUES (?, ?, ?)`,
      [
        memberId,
        `${type === 'deposit' ? 'Deposit' : 'Withdrawal'} of KES ${amount} ${type === 'deposit' ? 'to' : 'from'} your account`,
        'success'
      ]
    );

    await connection.commit();

    res.json({
      status: 'success',
      message: 'Transaction completed successfully',
      data: {
        transactionId: transaction.insertId
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Transaction error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process transaction'
    });
  } finally {
    connection.release();
  }
});

// Notification Routes
app.get('/api/treasurer/notifications', authenticateTreasurer, async (req, res) => {
  try {
    const [notifications] = await pool.query(
      `SELECT n.*, m.firstName, m.lastName
       FROM notifications n
       LEFT JOIN members m ON n.memberId = m.id
       WHERE n.treasurerId = ? OR n.treasurerId IS NULL
       ORDER BY n.createdAt DESC
       LIMIT 50`,
      [req.treasurer.id]
    );

    res.json({
      status: 'success',
      data: notifications
    });
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications'
    });
  }
});

// Report Generation Routes
app.post('/api/treasurer/reports/generate', authenticateTreasurer, async (req, res) => {
  try {
    const { type, startDate, endDate } = req.body;

    let query = '';
    let params = [];

    switch (type) {
      case 'monthly':
        query = `
          SELECT m.firstName, m.lastName, m.phoneNumber,
                 mc.amount, mc.status, mc.month,
                 t.type, t.purpose
          FROM members m
          LEFT JOIN monthly_contributions mc ON m.id = mc.memberId
          LEFT JOIN transactions t ON mc.transactionId = t.id
          WHERE DATE_FORMAT(mc.month, '%Y-%m') = DATE_FORMAT(?, '%Y-%m')
        `;
        params = [startDate];
        break;

      case 'annual':
        query = `
          SELECT m.firstName, m.lastName, m.phoneNumber,
                 SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE 0 END) as totalDeposits,
                 SUM(CASE WHEN t.type = 'withdrawal' THEN t.amount ELSE 0 END) as totalWithdrawals,
                 COUNT(DISTINCT mc.id) as contributionMonths
          FROM members m
          LEFT JOIN transactions t ON m.id = t.memberId
          LEFT JOIN monthly_contributions mc ON m.id = mc.memberId
          WHERE YEAR(COALESCE(t.createdAt, mc.month)) = YEAR(?)
          GROUP BY m.id
        `;
        params = [startDate];
        break;

      default:
        throw new Error('Invalid report type');
    }

    const [results] = await pool.query(query, params);

    // Generate report data
    const reportData = {
      title: type === 'monthly' ? 'Monthly Report' : 'Annual Report',
      generatedDate: new Date().toISOString(),
      generatedBy: `${req.treasurer.firstName} ${req.treasurer.lastName}`,
      data: results
    };

    res.json({
      status: 'success',
      data: reportData
    });
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate report'
    });
  }
});


//Stats
async function getMemberStats(connection) {
  const [stats] = await connection.query(`
    SELECT 
      COUNT(*) as totalMembers,
      COUNT(CASE WHEN registrationPaid = 1 THEN 1 END) as registeredMembers,
      COUNT(CASE WHEN registrationPaid = 0 THEN 1 END) as pendingRegistrations,
      SUM(balance) as totalBalance,
      (SELECT COUNT(*) 
       FROM monthly_contributions 
       WHERE MONTH(month) = MONTH(CURRENT_DATE) 
       AND YEAR(month) = YEAR(CURRENT_DATE)
       AND status = 'paid') as paidThisMonth
    FROM members
  `);
  
  return stats[0];
}

// Member Management Routes
app.get('/api/treasurer/members', authenticateTreasurer, async (req, res) => {
  try {
    const { search, filter, sort, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT 
        m.*,
        COALESCE(SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE -t.amount END), 0) as totalTransactions,
        COALESCE(COUNT(DISTINCT mc.id), 0) as contributionMonths,
        COALESCE(
          (SELECT amount FROM monthly_contributions 
           WHERE memberId = m.id 
           AND MONTH(month) = MONTH(CURRENT_DATE)
           AND YEAR(month) = YEAR(CURRENT_DATE)
           LIMIT 1
          ), 0
        ) as currentMonthContribution
      FROM members m
      LEFT JOIN transactions t ON m.id = t.memberId
      LEFT JOIN monthly_contributions mc ON m.id = mc.memberId
    `;

    const queryParams = [];

    if (search) {
      query += ` WHERE (m.firstName LIKE ? OR m.lastName LIKE ? OR m.phoneNumber LIKE ?)`;
      queryParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` GROUP BY m.id`;

    if (filter) {
      switch (filter) {
        case 'defaulters':
          query += ` HAVING currentMonthContribution = 0`;
          break;
        case 'active':
          query += ` HAVING currentMonthContribution > 0`;
          break;
      }
    }

    if (sort) {
      query += ` ORDER BY ${sort} ${req.query.order || 'ASC'}`;
    } else {
      query += ` ORDER BY m.firstName ASC`;
    }

    query += ` LIMIT ? OFFSET ?`;
    queryParams.push(parseInt(limit), offset);

    const [members] = await pool.query(query, queryParams);
    const [totalCount] = await pool.query(
      `SELECT COUNT(*) as total FROM members ${search ? `WHERE firstName LIKE ? OR lastName LIKE ? OR phoneNumber LIKE ?` : ''}`,
      search ? [`%${search}%`, `%${search}%`, `%${search}%`] : []
    );

    res.json({
      status: 'success',
      data: {
        members,
        pagination: {
          total: totalCount[0].total,
          page: parseInt(page),
          totalPages: Math.ceil(totalCount[0].total / limit)
        }
      }
    });
  } catch (error) {
    console.error('Members fetch error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch members'
    });
  }
});

// Treasury Management Routes
app.get('/api/treasurer/treasury/summary', authenticateTreasurer, async (req, res) => {
  try {
    const [summary] = await pool.query(`
      SELECT 
        (SELECT COALESCE(SUM(balance), 0) FROM members) as totalBalance,
        (SELECT COALESCE(SUM(amount), 0) 
         FROM monthly_contributions 
         WHERE MONTH(month) = MONTH(CURRENT_DATE) 
         AND YEAR(month) = YEAR(CURRENT_DATE)) as currentMonthContributions,
        (SELECT COALESCE(SUM(amount), 0) 
         FROM monthly_contributions 
         WHERE status = 'pending') as pendingPayments,
        (SELECT COUNT(*) FROM members) as totalMembers,
        (SELECT COUNT(*) 
         FROM monthly_contributions 
         WHERE MONTH(month) = MONTH(CURRENT_DATE) 
         AND YEAR(month) = YEAR(CURRENT_DATE)
         AND status = 'paid') as paidMembersThisMonth
    `);

    const [monthlyTrends] = await pool.query(`
      SELECT 
        DATE_FORMAT(month, '%Y-%m') as monthYear,
        COUNT(*) as totalMembers,
        COALESCE(SUM(amount), 0) as totalAmount,
        COUNT(CASE WHEN status = 'paid' THEN 1 END) as paidMembers
      FROM monthly_contributions
      WHERE month >= DATE_SUB(CURRENT_DATE, INTERVAL 12 MONTH)
      GROUP BY monthYear
      ORDER BY monthYear
    `);

    res.json({
      status: 'success',
      data: {
        summary: summary[0],
        monthlyTrends
      }
    });
  } catch (error) {
    console.error('Treasury summary error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch treasury summary'
    });
  }
});

// Registration Management Routes
app.post('/api/treasurer/registration', authenticateTreasurer, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const { memberId } = req.body;
    const registrationFee = 100; // Fixed registration fee

    // Check if member exists and isn't already registered
    const [member] = await connection.query(
      'SELECT * FROM members WHERE id = ? AND registrationPaid = 0',
      [memberId]
    );

    if (!member.length) {
      throw new Error('Invalid member or already registered');
    }

    // Create registration transaction
    const [transaction] = await connection.query(
      `INSERT INTO transactions (memberId, type, amount, purpose, status, treasurerId)
       VALUES (?, 'deposit', ?, 'registration', 'completed', ?)`,
      [memberId, registrationFee, req.treasurer.id]
    );

    // Update member registration status
    await connection.query(
      'UPDATE members SET registrationPaid = 1 WHERE id = ?',
      [memberId]
    );

    // Create notification
    await connection.query(
      `INSERT INTO notifications (memberId, message, type)
       VALUES (?, 'Registration fee payment received successfully', 'success')`,
      [memberId]
    );

    await connection.commit();

    res.json({
      status: 'success',
      message: 'Registration completed successfully',
      data: {
        transactionId: transaction.insertId
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Registration error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message || 'Failed to process registration'
    });
  } finally {
    connection.release();
  }
});

// Settings and Profile Routes
app.put('/api/treasurer/profile', authenticateTreasurer, async (req, res) => {
  try {
    const { firstName, lastName, phoneNumber, currentPassword, newPassword } = req.body;

    if (newPassword) {
      // Verify current password
      const [treasurer] = await pool.query(
        'SELECT password FROM treasurers WHERE id = ?',
        [req.treasurer.id]
      );

      const isValid = await bcrypt.compare(currentPassword, treasurer[0].password);
      if (!isValid) {
        return res.status(400).json({
          status: 'error',
          message: 'Current password is incorrect'
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      await pool.query(
        `UPDATE treasurers 
         SET firstName = ?, lastName = ?, phoneNumber = ?, password = ?
         WHERE id = ?`,
        [firstName, lastName, phoneNumber, hashedPassword, req.treasurer.id]
      );
    } else {
      await pool.query(
        `UPDATE treasurers 
         SET firstName = ?, lastName = ?, phoneNumber = ?
         WHERE id = ?`,
        [firstName, lastName, phoneNumber, req.treasurer.id]
      );
    }

    res.json({
      status: 'success',
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error:', err);
  res.status(500).json({
    status: 'error',
    message: 'An unexpected error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;