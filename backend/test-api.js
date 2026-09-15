import fetch from 'node-fetch';

async function testAPI() {
  try {
    // Login
    const loginRes = await fetch('http://127.0.0.1:3000/api/admin/staff/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.com', password: 'password' }),
    });
    const loginData = await loginRes.json();
    console.log('Login:', JSON.stringify(loginData, null, 2));

    if (!loginRes.ok) {
      console.log('Login failed');
      return;
    }

    const cookie = loginRes.headers.get('set-cookie');
    console.log('Cookie:', cookie);

    // Test cash accounts list
    const accountsRes = await fetch('http://127.0.0.1:3000/api/admin/cash-accounts', {
      headers: { 'Cookie': cookie },
    });
    const accountsData = await accountsRes.json();
    console.log('Accounts:', JSON.stringify(accountsData, null, 2));

    // Test default drawer
    const drawerRes = await fetch('http://127.0.0.1:3000/api/admin/cash-accounts/drawer/default', {
      headers: { 'Cookie': cookie },
    });
    const drawerData = await drawerRes.json();
    console.log('Default Drawer:', JSON.stringify(drawerData, null, 2));

    // Test cash overview
    const overviewRes = await fetch('http://127.0.0.1:3000/api/admin/dashboard/cash-overview', {
      headers: { 'Cookie': cookie },
    });
    const overviewData = await overviewRes.json();
    console.log('Cash Overview:', JSON.stringify(overviewData, null, 2));

  } catch (err) {
    console.error('Error:', err);
  }
}

testAPI();