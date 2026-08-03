const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ ПОДКЛЮЧЕНИЕ К БАЗЕ ============
const supabase = createClient(
  'https://zfbyfhpqxxosefgwlavb.supabase.co',
  'sb_publishable_zhiAays5ACdVyJwPJByKjA_E5J281q_'
);

// ============ ОТДАЁМ HTML ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.use(express.static(__dirname));

// ============ РЕГИСТРАЦИЯ (МАКСИМУМ 3 АККАУНТА) ============
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Логин (мин 3) и пароль (мин 4)' });
  }
  
  try {
    const { count, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });
      
    if (countError) throw countError;
    
    if (count >= 3) {
      return res.status(400).json({ error: '❌ Достигнут лимит аккаунтов (максимум 3)' });
    }
    
    const { data: existing } = await supabase
      .from('users')
      .select('username')
      .eq('username', username)
      .single();
      
    if (existing) {
      return res.status(400).json({ error: 'Пользователь уже существует' });
    }
    
    const hash = await bcrypt.hash(password, 10);
    const { data: user, error } = await supabase
      .from('users')
      .insert({ username, password_hash: hash, is_admin: false, is_banned: false })
      .select()
      .single();
      
    if (error) throw error;
    
    await supabase.from('scores').insert({ 
      user_id: user.id, 
      score: 0,
      level: 1,
      power: 1,
      auto: 0,
      total: 0,
      buyCount: 0,
      xp: 0,
      nextXP: 1000,
      achievements: [],
      upgrades: [],
      admin_note: ''
    });
    
    res.json({ success: true, message: 'Регистрация успешна!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ЛОГИН ============
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();
      
    if (!user) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }
    
    if (user.is_banned) {
      return res.status(403).json({ 
        error: '⛔ Вы забанены!',
        ban_reason: user.ban_reason || 'Причина не указана'
      });
    }
    
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }
    
    const { data: score } = await supabase
      .from('scores')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    res.json({
      success: true,
      user_id: user.id,
      username: user.username,
      is_admin: user.is_admin || false,
      score: score?.score || 0,
      level: score?.level || 1,
      power: score?.power || 1,
      auto: score?.auto || 0,
      total: score?.total || 0,
      buyCount: score?.buyCount || 0,
      xp: score?.xp || 0,
      nextXP: score?.nextXP || 1000,
      achievements: score?.achievements || [],
      upgrades: score?.upgrades || []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ СОХРАНИТЬ РЕКОРД ============
app.post('/save-score', async (req, res) => {
  const { user_id, score, level, power, auto, total, buyCount, xp, nextXP, achievements, upgrades } = req.body;
  
  if (!user_id) {
    return res.status(400).json({ error: 'Не передан user_id' });
  }
  
  try {
    const { error } = await supabase
      .from('scores')
      .update({ 
        score, 
        level, 
        power, 
        auto,
        total,
        buyCount: buyCount || 0,
        xp: xp || 0,
        nextXP: nextXP || 1000,
        achievements: achievements || [],
        upgrades: upgrades || [],
        updated_at: new Date()
      })
      .eq('user_id', user_id);
      
    if (error) throw error;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ ПОЛУЧИТЬ ТАБЛИЦУ ЛИДЕРОВ ============
app.get('/leaderboard', async (req, res) => {
  try {
    const { data } = await supabase
      .from('scores')
      .select(`
        score,
        level,
        admin_note,
        users!inner (id, username, is_banned, is_admin)
      `)
      .order('score', { ascending: false })
      .limit(20);
      
    const formatted = data
      .filter(item => !item.users.is_banned)
      .map(item => ({
        user_id: item.users.id,
        username: item.users.username,
        score: item.score,
        level: item.level,
        is_admin: item.users.is_admin || false,
        admin_note: item.admin_note || ''
      }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================================
// АДМИН-ФУНКЦИИ
// ================================================================

app.post('/admin/add-score', async (req, res) => {
  const { admin_id, username, amount } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();
      
    if (!user) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    const { data: score } = await supabase
      .from('scores')
      .select('score')
      .eq('user_id', user.id)
      .single();
      
    const newScore = (score?.score || 0) + amount;
    
    await supabase
      .from('scores')
      .update({ score: newScore })
      .eq('user_id', user.id);
      
    res.json({ success: true, new_score: newScore });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/ban', async (req, res) => {
  const { admin_id, username, reason } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('id, is_admin')
      .eq('username', username)
      .single();
      
    if (!user) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    if (user.is_admin) {
      return res.status(403).json({ error: 'Нельзя забанить администратора' });
    }
    
    await supabase
      .from('users')
      .update({ is_banned: true, ban_reason: reason || 'Причина не указана' })
      .eq('id', user.id);
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/unban', async (req, res) => {
  const { admin_id, username } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    await supabase
      .from('users')
      .update({ is_banned: false, ban_reason: '' })
      .eq('username', username);
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/unlock-achievement', async (req, res) => {
  const { admin_id, username, achievement_id } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();
      
    if (!user) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    const { data: score } = await supabase
      .from('scores')
      .select('achievements')
      .eq('user_id', user.id)
      .single();
      
    let achievements = score?.achievements || [];
    if (!achievements.includes(achievement_id)) {
      achievements.push(achievement_id);
    }
    
    await supabase
      .from('scores')
      .update({ achievements: achievements })
      .eq('user_id', user.id);
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/admin/set-note', async (req, res) => {
  const { admin_id, username, note } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data: user } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();
      
    if (!user) {
      return res.status(404).json({ error: 'Игрок не найден' });
    }
    
    await supabase
      .from('scores')
      .update({ admin_note: note || '' })
      .eq('user_id', user.id);
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/admin/users', async (req, res) => {
  const { admin_id } = req.query;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data } = await supabase
      .from('users')
      .select(`
        id,
        username,
        is_admin,
        is_banned,
        ban_reason,
        scores (score, level, total, admin_note)
      `);
      
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================================
// ГЛОБАЛЬНОЕ СООБЩЕНИЕ
// ================================================================

app.post('/admin/global-msg', async (req, res) => {
  const { admin_id, message } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    const { data: existing } = await supabase
      .from('global_messages')
      .select('id')
      .limit(1);
      
    if (existing && existing.length > 0) {
      await supabase
        .from('global_messages')
        .update({ message: message, admin_id: admin_id, updated_at: new Date() })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('global_messages')
        .insert({ message: message, admin_id: admin_id, updated_at: new Date() });
    }
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/global-msg', async (req, res) => {
  try {
    const { data } = await supabase
      .from('global_messages')
      .select('message')
      .limit(1);
      
    if (data && data.length > 0 && data[0].message) {
      res.json({ message: data[0].message });
    } else {
      res.json({ message: null });
    }
  } catch (error) {
    res.json({ message: null });
  }
});

app.delete('/admin/global-msg', async (req, res) => {
  const { admin_id } = req.body;
  
  try {
    const { data: admin } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', admin_id)
      .single();
      
    if (!admin || !admin.is_admin) {
      return res.status(403).json({ error: 'Недостаточно прав' });
    }
    
    await supabase
      .from('global_messages')
      .update({ message: '' })
      .neq('id', '');
      
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});