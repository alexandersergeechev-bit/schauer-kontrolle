// Константы проекта
const COST_PER_MINUTE = 0.13;

// Ссылка на твою базу данных Firebase (ОБЯЗАТЕЛЬНО ЗАМЕНИ НА СВОЮ!)
const FIREBASE_URL = "https://schauer-kontrolle-default-rtdb.europe-west1.firebasedatabase.app";

const USER_NAMES = {
    Dad: "Саша",
    Mom: "Олечка",
    Veronika: "Вероника",
    Milana: "Милана"
};

let activeTimers = {};
let showerHistory = [];

// При загрузке страницы подключаемся к базе данных
document.addEventListener("DOMContentLoaded", () => {
    // Начинаем слушать изменения в базе данных каждые 2 секунды (авто-обновление)
    syncWithFirebase();
    setInterval(syncWithFirebase, 2000);
});

// Функция загрузки данных из облака
async function syncWithFirebase() {
    try {
        // Получаем историю и текущие таймеры одним запросом
        const response = await fetch(`${FIREBASE_URL}/.json`);
        const data = await response.json();
        
        if (data) {
            showerHistory = data.history ? Object.values(data.history) : [];
            // Сортируем историю: новые сверху
            showerHistory.sort((a, b) => b.id - a.id);
            
            activeTimers = data.activeTimers || {};
        } else {
            showerHistory = [];
            activeTimers = {};
        }
        
        updateUI();
    } catch (error) {
        console.error("Ошибка синхронизации с облаком:", error);
    }
}

// Клик по кнопке СТАРТ / ГОТОВО
async function toggleShower(userId) {
    // Временно блокируем кнопку, чтобы избежать двойных кликов при плохом интернете
    const btn = document.getElementById(`btn-${userId}`);
    btn.disabled = true;

    if (!activeTimers[userId]) {
        // СТАРТ: отправляем время начала в облако
        const startTimeIso = new Date().toISOString();
        await fetch(`${FIREBASE_URL}/activeTimers/${userId}.json`, {
            method: 'PUT',
            body: JSON.stringify(startTimeIso)
        });
    } else {
        // ГОТОВО: считаем время
        const startTime = new Date(activeTimers[userId]);
        const endTime = new Date();
        const durationMs = endTime - startTime;
        
        const durationMinutes = Math.max(0.1, parseFloat((durationMs / 1000 / 60).toFixed(1)));
        const cost = parseFloat((durationMinutes * COST_PER_MINUTE).toFixed(2));
        
        const record = {
            id: Date.now(),
            user: userId,
            dateStr: endTime.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }),
            timeStr: `${startTime.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})} - ${endTime.toLocaleTimeString('de-DE', {hour: '2-digit', minute:'2-digit'})}`,
            minutes: durationMinutes,
            cost: cost
        };
        
        // Отправляем запись в историю в облако
        await fetch(`${FIREBASE_URL}/history.json`, {
            method: 'POST',
            body: JSON.stringify(record)
        });
        
        // Удаляем активный таймер из облака
        await fetch(`${FIREBASE_URL}/activeTimers/${userId}.json`, {
            method: 'DELETE'
        });
    }
    
    // Принудительно обновляем данные
    await syncWithFirebase();
}

function updateUI() {
    // Обновляем визуальное состояние кнопок (горит ли у кого-то красный)
    const users = ['Dad', 'Mom', 'Veronika', 'Milana'];
    
    // Проверяем, включен ли душ вообще хоть у кого-то
    const dynamicActiveUser = Object.keys(activeTimers).length > 0 ? Object.keys(activeTimers)[0] : null;

    users.forEach(id => {
        const card = document.getElementById(`card-${id}`);
        const btn = document.getElementById(`btn-${id}`);
        
        if (activeTimers[id]) {
            // Если этот пользователь сейчас моется
            card.classList.add('active');
            btn.textContent = "ГОТОВО";
            btn.disabled = false;
            card.style.opacity = "1";
        } else {
            card.classList.remove('active');
            btn.textContent = "СТАРТ";
            
            // Если моется КТО-ТО ДРУГОЙ, блокируем кнопку
            if (dynamicActiveUser && dynamicActiveUser !== id) {
                btn.disabled = true;
                card.style.opacity = "0.5";
            } else {
                btn.disabled = false;
                card.style.opacity = "1";
            }
        }
    });

    updateSummary();
    renderHistory();
    updateInsights();
}

function updateSummary() {
    const summary = { Dad: { min: 0, cash: 0 }, Mom: { min: 0, cash: 0 }, Veronika: { min: 0, cash: 0 }, Milana: { min: 0, cash: 0 } };
    
    showerHistory.forEach(item => {
        if (summary[item.user]) {
            summary[item.user].min += item.minutes;
            summary[item.user].cash += item.cost;
        }
    });
    
    for (let user in summary) {
        document.getElementById(`sum-min-${user}`).textContent = `${summary[user].min.toFixed(1)} мин`;
        document.getElementById(`sum-cash-${user}`).textContent = `${summary[user].cash.toFixed(2)} €`;
    }
}

function renderHistory() {
    const container = document.getElementById('history-list');
    container.innerHTML = '';
    
    if (showerHistory.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#a0aec0; padding:20px; font-size:13px;">История пуста. Время экономить!</div>';
        return;
    }
    
    showerHistory.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div>
                <span class="history-user ${item.user}">${USER_NAMES[item.user]}</span>
                <div class="history-time">${item.dateStr} в ${item.timeStr}</div>
            </div>
            <div style="text-align: right;">
                <div class="history-cost">${item.cost.toFixed(2)} €</div>
                <div style="font-size: 11px; color: #718096;">${item.minutes.toFixed(1)} мин</div>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateInsights() {
    const insightElement = document.getElementById('insight-text');
    const kidsData = showerHistory.filter(i => i.user === 'Veronika' || i.user === 'Milana');
    const totalKidsCost = kidsData.reduce((sum, item) => sum + item.cost, 0);
    
    if (totalKidsCost === 0) {
        insightElement.innerHTML = "<b>💡 Мотивация:</b> Смыто в душ: 0 €. Отличный старт, девчонки! Посмотрим, кто из вас сохранит больше денег?";
        return;
    }
    
    const chipsCount = Math.floor(totalKidsCost / 2);
    const cinemaTickets = Math.floor(totalKidsCost / 10);
    
    let message = `<b>💡 Экономика ванны:</b> Совместными усилиями дочерей в душе уже оставлено <b>${totalKidsCost.toFixed(2)} €</b>.<br>`;
    if (cinemaTickets > 0) {
        message += `На эти деньги можно было купить <b>${cinemaTickets} шт.</b> билетов в кино! 🍿`;
    } else if (chipsCount > 0) {
        message += `Это цена <b>${chipsCount} больших пачек</b> чипсов! 🥔`;
    } else {
        message += `Этой суммы хватило бы на классные мелочи! 🛍️`;
    }
    insightElement.innerHTML = message;
}

async function clearAllStats() {
    if (confirm("Вы уверены, что хотите полностью очистить общую базу данных за месяц?")) {
        await fetch(`${FIREBASE_URL}/.json`, { method: 'DELETE' });
        await syncWithFirebase();
    }
}