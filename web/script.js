// Telegram Web App helper (when opened inside Telegram)
if (window.Telegram?.WebApp) {
  const WebApp = window.Telegram.WebApp;
  WebApp.expand();
}

// Example: wire clicks to the Telegram Web App main button or send data to bot backend
const bind = (id, handler)=>{
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('click', handler);
};

bind('rent', ()=>{
  if(window.Telegram?.WebApp){
    // you can send data via Web App or close and instruct the user
    window.Telegram.WebApp.sendData(JSON.stringify({action:'rent'}));
  } else alert('Open this page inside Telegram to interact with the bot.');
});

bind('topup', ()=>{
  if(window.Telegram?.WebApp){
    window.location.href = window.location.origin + '/topup.html';
  } else alert('Open this page inside Telegram to interact with the bot.');
});

bind('support', ()=>{
  if(window.Telegram?.WebApp){
    window.Telegram.WebApp.sendData(JSON.stringify({action:'support'}));
  } else alert('Open this page inside Telegram to interact with the bot.');
});
