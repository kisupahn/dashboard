function updateClock() {
  const now = new Date();

  document.getElementById("clock").textContent =
    now.toLocaleTimeString("ko-KR");
}

updateClock();
setInterval(updateClock, 1000);
