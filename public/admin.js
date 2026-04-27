document.addEventListener('DOMContentLoaded', () => {
  fetchDashboardStats();
  fetchActivityChart();
  fetchRecentActivity();
  fetchUsers();
});

async function fetchDashboardStats() {
  try {
    const res = await fetch('/api/dashboard/stats');
    const data = await res.json();
    
    document.getElementById('kpi-users').innerText = data.users;
    document.getElementById('kpi-docs').innerText = data.documents;
    document.getElementById('kpi-annotations').innerText = data.annotations;
    document.getElementById('kpi-reports').innerText = data.reports;
    document.getElementById('kpi-live').innerText = data.liveSessions;

    document.getElementById('nav-users-count').innerText = data.users;
    document.getElementById('nav-docs-count').innerText = data.documents;
    if(data.annotations > 1000) {
      document.getElementById('nav-annotations-count').innerText = (data.annotations/1000).toFixed(1) + 'k';
    } else {
      document.getElementById('nav-annotations-count').innerText = data.annotations;
    }
    
  } catch (err) {
    console.error('Error fetching dashboard stats:', err);
  }
}

async function fetchActivityChart() {
  try {
    const res = await fetch('/api/dashboard/activity-chart');
    const data = await res.json();

    const labels = [];
    const counts = [];
    
    // Generate last 14 days labels
    const today = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const displayStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      labels.push(displayStr);
      
      const record = data.find(item => item._id === dateStr);
      counts.push(record ? record.count : 0);
    }

    const ctx = document.getElementById('activityChart').getContext('2d');
    
    // Gradient for the bars
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, '#8b5cf6'); // accent-purple
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0.2)');

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Annotations',
          data: counts,
          backgroundColor: gradient,
          borderRadius: 4,
          borderSkipped: false,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1825',
            titleColor: '#8b8a96',
            bodyColor: '#f3f4f6',
            borderColor: '#2a2836',
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            callbacks: {
              label: function(context) {
                return `${context.raw} annotations`;
              }
            }
          }
        },
        scales: {
          y: {
            display: false,
            beginAtZero: true
          },
          x: {
            grid: { display: false, drawBorder: false },
            ticks: { color: '#8b8a96', maxTicksLimit: 5, font: { family: 'Inter', size: 11 } }
          }
        }
      }
    });

  } catch (err) {
    console.error('Error fetching activity chart:', err);
  }
}

async function fetchRecentActivity() {
  try {
    const res = await fetch('/api/history?limit=5');
    const logs = await res.json();
    const list = document.getElementById('activity-list');
    list.innerHTML = '';

    if (logs.length === 0) {
      list.innerHTML = '<div class="activity-desc">No recent activity.</div>';
      return;
    }

    logs.forEach(log => {
      let iconHtml = '';
      let actionText = '';
      
      if (log.action === 'DOCUMENT_UPLOADED') {
        iconHtml = '<div class="activity-icon icon-blue"><i class="bx bx-file"></i></div>';
        actionText = `<span>${log.author}</span> uploaded a document`;
      } else if (log.action === 'ANNOTATION_CREATED') {
        iconHtml = '<div class="activity-icon icon-purple"><i class="bx bx-message-square-dots"></i></div>';
        actionText = `<span>${log.author}</span> added an annotation`;
      } else if (log.action === 'ANNOTATION_RESOLVED') {
        iconHtml = '<div class="activity-icon icon-green"><i class="bx bx-check-circle"></i></div>';
        actionText = `<span>${log.author}</span> resolved annotation`;
      } else if (log.action === 'ANNOTATION_DELETED') {
        iconHtml = '<div class="activity-icon icon-orange"><i class="bx bx-trash"></i></div>';
        actionText = `<span>${log.author}</span> deleted an annotation`;
      } else if (log.action === 'REPLY_ADDED') {
         iconHtml = '<div class="activity-icon icon-purple"><i class="bx bx-reply"></i></div>';
         actionText = `<span>${log.author}</span> replied to a thread`;
      } else {
        iconHtml = '<div class="activity-icon icon-purple"><i class="bx bx-user"></i></div>';
        actionText = `<span>${log.author}</span> performed an action`;
      }

      const timeStr = timeAgo(new Date(log.timestamp));

      list.innerHTML += `
        <div class="activity-item">
          ${iconHtml}
          <div class="activity-content">
            <div class="activity-title">${actionText}</div>
            <div class="activity-desc">${log.details || ''}</div>
          </div>
          <div class="activity-time">${timeStr}</div>
        </div>
      `;
    });

  } catch (err) {
    console.error('Error fetching recent activity:', err);
  }
}

async function fetchUsers() {
  try {
    const res = await fetch('/api/users');
    const users = await res.json();
    
    document.getElementById('total-users-label').innerText = `${users.length} total`;
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = '';

    if (users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-secondary);">No users found.</td></tr>';
      return;
    }

    // Colors for avatars
    const colors = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'];

    users.forEach((user, index) => {
      const initial = user.username ? user.username.charAt(0).toUpperCase() : '?';
      const color = colors[index % colors.length];
      const email = user.email || `${user.username.toLowerCase()}@example.com`; // Mock email if missing
      
      const roleStr = user.role || 'Viewer';
      const statusStr = user.status || 'Active';
      const statusClass = statusStr.toLowerCase() === 'active' ? '' : 'inactive';
      
      const dateStr = new Date(user.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      tbody.innerHTML += `
        <tr>
          <td>
            <div class="user-cell">
              <div class="user-avatar" style="background-color: ${color}">${initial}</div>
              <div class="user-info">
                <span class="user-name">${user.username}</span>
                <span class="user-email">${email}</span>
              </div>
            </div>
          </td>
          <td><span class="role-badge">${roleStr}</span></td>
          <td><span class="status-badge ${statusClass}">${statusStr}</span></td>
          <td>${user.docsCount || 0}</td>
          <td>${user.annotationsCount || 0}</td>
          <td>${dateStr}</td>
        </tr>
      `;
    });
  } catch (err) {
    console.error('Error fetching users:', err);
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  let interval = seconds / 31536000;
  if (interval > 1) return Math.floor(interval) + "y ago";
  interval = seconds / 2592000;
  if (interval > 1) return Math.floor(interval) + "mo ago";
  interval = seconds / 86400;
  if (interval > 1) return Math.floor(interval) + "d ago";
  interval = seconds / 3600;
  if (interval > 1) return Math.floor(interval) + "h ago";
  interval = seconds / 60;
  if (interval > 1) return Math.floor(interval) + "m ago";
  return Math.floor(seconds) + "s ago";
}
