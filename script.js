function updateClock() {
  const now = new Date();

  document.getElementById("clock").textContent =
    now.toLocaleTimeString("ko-KR");
}

updateClock();
setInterval(updateClock, 1000);

const memoUrl = 'https://script.googleusercontent.com/macros/echo?user_content_key=AUkAhnQmJ963RtFHCJx_mnCmMnBDn4asRvTmcAdAzpj6OenzE_CVOauvJGxhwa6DJey1H95XPAjBDiSil7P32Z9AWRSuKfaezjpunU4eriXzadQUeX9jL_pBbMpH33aw0aqo2X-FuPLT49OyFKjJW0AXeyus8cd6MOIKwY7CkgfpAYP_2hxPeJ6JwtbiO_uDxMlD4RT9YjD_H6Jsl3iBvGoFUMMAuJ3KgGp1IUx3YeUjPl-e2KxuIYKOOViedcKDgzIUZvOOAdAKd3YyQ9s62vU&lib=MQ0w-J6fltxPqWZkYIi0S-KVQSSnWPj7K';

async function loadMemo() {
  const response = await fetch(memoUrl);
  const data = await response.json();

  document.getElementById('memo').textContent = data.memo;
}

loadMemo();
