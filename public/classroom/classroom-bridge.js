(() => {
  'use strict';
  const moduleId = document.getElementById('classroom-bridge').dataset.module;
  const embedded = window.parent !== window && new URLSearchParams(location.search).get('embedded') === '1';
  document.documentElement.dataset.classroomModule = moduleId;
  document.documentElement.dataset.embedded = String(embedded);

  // A standalone classroom keeps a direct return path to the combined platform.
  const home = document.querySelector('a.brand');
  if (home) {
    home.href = '/#classroom';
    home.target = '_top';
  } else if (!embedded) {
    const returnLink = document.createElement('a');
    returnLink.href = '/#classroom';
    returnLink.className = 'classroom-return';
    returnLink.textContent = '← 返回实验中心';
    document.querySelector('.app > header').append(returnLink);
  }
  if (!embedded) return;

  let active = false;
  let stoppingMicrophone = false;
  const origin = location.origin;
  const send = (type, extra = {}) => parent.postMessage({ type, moduleId, ...extra }, origin);

  function stopHiddenAudio() {
    if (active || moduleId !== 'sound') return;
    const stopTone = document.getElementById('stopTone');
    if (stopTone && !stopTone.disabled) stopTone.click();
    const status = document.getElementById('status');
    if (!status?.classList.contains('live')) {
      stoppingMicrophone = false;
    } else if (!stoppingMicrophone) {
      stoppingMicrophone = true;
      document.getElementById('stopBtn').click();
    }
  }

  if (moduleId === 'sound') {
    // A permission prompt may resolve after the user has switched sections.
    // Reject that stale request and release the stream before the old UI uses it.
    const devices = navigator.mediaDevices;
    if (devices?.getUserMedia) {
      const getUserMedia = devices.getUserMedia.bind(devices);
      devices.getUserMedia = async (constraints) => {
        const stream = await getUserMedia(constraints);
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          throw new DOMException('Classroom is not active', 'AbortError');
        }
        return stream;
      };
    }
    const observer = new MutationObserver(stopHiddenAudio);
    observer.observe(document.getElementById('status'), { attributes: true, attributeFilter: ['class'] });
    observer.observe(document.getElementById('stopTone'), { attributes: true, attributeFilter: ['disabled'] });
  }

  const app = document.querySelector('.app');
  let previousHeight = 0;
  function reportSize() {
    if (!active) return;
    const height = Math.ceil(app.getBoundingClientRect().height);
    if (height > 0 && height !== previousHeight) {
      previousHeight = height;
      send('gewulab:height', { height });
    }
  }
  new ResizeObserver(reportSize).observe(app);
  window.addEventListener('message', (event) => {
    if (event.origin !== origin || event.source !== parent || event.data?.type !== 'gewulab:active') return;
    active = event.data.active === true;
    send('gewulab:active-ack');
    stopHiddenAudio();
    if (active) requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'));
      reportSize();
    });
  });
  send('gewulab:ready');
})();
