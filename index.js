const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcrypt');
const path = require('path');  // ← ДОБАВЛЯЕМ

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============ ВСТАВЬ СВОИ ДАННЫЕ СЮДА ============
const supabase = createClient(
  'https://zfbyfhpqxxosefgwlavb.supabase.co',  // 🔥 Project URL
  'sb_publishable_zhiAays5ACdVyJwPJByKjA_E5J281q_'    // 🔥 anon ключ
);

// ============ ОТДАЁМ HTML-ФАЙЛ ============
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Раздаём статические файлы (аудио, картинки и т.д.)
app.use(express.static(__dirname));

// ============ РЕГИСТРАЦИЯ ============
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password || username.length < 3 || password.length < 4) {
    return res.status(400).json({ error: 'Логин (мин 3) и пароль (мин 4)' });
  }
  
  try {
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
      .insert({ username, password_hash: hash })
      .select()
      .single();
      
    if (error) throw error;
    
    await supabase.from('scores').insert({ 
      user_id: user.id, 
      score: 0,
      level: 1,
      power: 1,
      auto: 0,
      total: 0
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
      score: score?.score || 0,
      level: score?.level || 1,
      power: score?.power || 1,
      auto: score?.auto || 0,
      total: score?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ СОХРАНИТЬ РЕКОРД ============
app.post('/save-score', async (req, res) => {
  const { user_id, score, level, power, auto, total } = req.body;
  
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
        users!inner (username)
      `)
      .order('score', { ascending: false })
      .limit(20);
      
    const formatted = data.map(item => ({
      username: item.users.username,
      score: item.score,
      level: item.level
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
});
