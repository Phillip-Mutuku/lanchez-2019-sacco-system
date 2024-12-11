const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'lanchez_2019_db'
};

// Member data from the PDF
const members = [
  // Page 1
  {firstName: 'Nichodemus', lastName: 'Mulei', position: 'Chairperson', phoneNumber: '743159496'},
  {firstName: 'Philip', lastName: 'Mutuku', position: 'Vice Chairperson', phoneNumber: '746092415'},
  {firstName: 'Bernard', lastName: 'Munyoki', position: 'Secretary', phoneNumber: '792417702'},
  {firstName: 'Catherine', lastName: 'Temea', position: 'Treasurer', phoneNumber: '705185868'},
  {firstName: 'Emily', lastName: 'Shiru', position: 'Organising Secretary', phoneNumber: '112213335'},
  {firstName: 'Alphonse', lastName: 'Malonza', position: 'Representative', phoneNumber: '740654696'},
  {firstName: 'Mercy', lastName: 'Munanie', position: 'Representative', phoneNumber: '721329099'},
  {firstName: 'Catherine', lastName: 'Mbithe', position: 'Representative', phoneNumber: '799503773'},
  {firstName: 'Fridah', lastName: 'Telesia', position: 'Representative', phoneNumber: '114165857'},
  {firstName: 'Meshack', lastName: 'Mwanzia', position: 'Member', phoneNumber: '768848904'},
  {firstName: 'Lydia', lastName: 'Mumbe', position: 'Member', phoneNumber: '718908013'},
  {firstName: 'Jackline', lastName: 'Kavutha', position: 'Member', phoneNumber: '703400363'},
  {firstName: 'Janet', lastName: 'Mueni', position: 'Member', phoneNumber: '715200230'},
  {firstName: 'Musyoki', lastName: 'Kalewa', position: 'Member', phoneNumber: '790168929'},
  {firstName: 'Cardia', lastName: 'Ndivo', position: 'Member', phoneNumber: '768283391'},
  {firstName: 'Munyao', lastName: 'Kioko', position: 'Member', phoneNumber: '757636668'},
  {firstName: 'Makau', lastName: 'Kioko', position: 'Member', phoneNumber: '713159821'},
  {firstName: 'Nduku', lastName: 'Mutheu', position: 'Member', phoneNumber: '762572702'},
  {firstName: 'Esther', lastName: 'Mutie', position: 'Member', phoneNumber: '115243687'},
  {firstName: 'Tonny', lastName: 'Byron', position: 'Member', phoneNumber: '786708525'},
  {firstName: 'Patrick', lastName: 'maithya', position: 'Member', phoneNumber: '742413709'},
  {firstName: 'Abby', lastName: 'Betty', position: 'Member', phoneNumber: '114661908'},
  {firstName: 'Eric', lastName: 'Muasya', position: 'Member', phoneNumber: '701601274'},
  {firstName: 'Marion', lastName: 'Hens', position: 'Member', phoneNumber: '746633931'},
  {firstName: 'Charity', lastName: 'Kadzo', position: 'Member', phoneNumber: '797739184'},
  {firstName: 'Munyalo', lastName: 'Grace', position: 'Member', phoneNumber: '746396645'},
  {firstName: 'Agnes', lastName: 'Mulei', position: 'Member', phoneNumber: '796682780'},
  {firstName: 'Purity', lastName: 'Muthui', position: 'Member', phoneNumber: '701566507'},
  {firstName: 'John', lastName: 'Kioko', position: 'Member', phoneNumber: '713159821'},
  {firstName: 'Diana', lastName: 'Syombua', position: 'Member', phoneNumber: '794784039'},
  
  // Page 2
  {firstName: 'Lilian', lastName: 'Nthenya', position: 'Member', phoneNumber: '706335309'},
  {firstName: 'Lucy', lastName: 'Nthambi', position: 'Member', phoneNumber: '718498998'},
  {firstName: 'Bernard', lastName: 'Mwaniki', position: 'Member', phoneNumber: '726280972'},
  {firstName: 'Nicodemus', lastName: 'Musyoka', position: 'Member', phoneNumber: '704714745'},
  {firstName: 'Philip', lastName: 'Beth', position: 'Member', phoneNumber: '742415254'},
  {firstName: 'Mercy', lastName: 'Nduku', position: 'Member', phoneNumber: '792767088'},
  {firstName: 'Peter', lastName: 'Mutua', position: 'Member', phoneNumber: '768534718'},
  {firstName: 'Mwalimu', lastName: 'Monicah', position: 'Member', phoneNumber: '745922490'},
  {firstName: 'Gideon', lastName: 'Mumo', position: 'Member', phoneNumber: '715877501'}
];

async function uploadMembers() {
  let connection;
  try {
    // Create database connection
    connection = await mysql.createConnection(dbConfig);
    
    // First, create the members table if it doesn't exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS members (
        id INT PRIMARY KEY AUTO_INCREMENT,
        firstName VARCHAR(255) NOT NULL,
        lastName VARCHAR(255) NOT NULL,
        phoneNumber VARCHAR(15) UNIQUE NOT NULL,
        position VARCHAR(50) NOT NULL,
        balance DECIMAL(10, 2) DEFAULT 0.00,
        defaultedAmount DECIMAL(10, 2) DEFAULT 0.00,
        registrationPaid BOOLEAN DEFAULT FALSE,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('Table verified/created successfully');

    // Insert members one by one
    for (const member of members) {
      try {
        await connection.query(
          'INSERT INTO members (firstName, lastName, phoneNumber, position) VALUES (?, ?, ?, ?)',
          [member.firstName, member.lastName, member.phoneNumber, member.position]
        );
        console.log(`Successfully added member: ${member.firstName} ${member.lastName}`);
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          console.log(`Skipping duplicate member: ${member.firstName} ${member.lastName}`);
        } else {
          console.error(`Error adding member ${member.firstName} ${member.lastName}:`, err.message);
        }
      }
    }

    console.log('All members processed successfully');

    // Display summary of members in database
    const [rows] = await connection.query('SELECT COUNT(*) as count FROM members');
    console.log(`Total members in database: ${rows[0].count}`);

  } catch (err) {
    console.error('Database operation failed:', err);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the upload script
uploadMembers().then(() => {
  console.log('Script completed');
}).catch(err => {
  console.error('Script failed:', err);
});