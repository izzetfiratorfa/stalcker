// ============================================================
// STAL(C)KER — Regresyon Test Scripti
// ============================================================
// Amaç: Her değişiklikten sonra temel akışların (arama, filtre,
// kitap ekleme, detay açma) hâlâ çalıştığını doğrulamak.
//
// Kullanım:
//   npm install jsdom --no-save   (bir kere)
//   node test-regresyon.js /path/to/kitap-cafe-sistemi.html
//
// Bu script gerçek bir tarayıcı gibi HTML+JS'i çalıştırır,
// sahte kitap verisi enjekte eder (window.eval ile — çünkü
// 'let books' script-scope'da yaşar, window.books olarak
// dışarıdan erişilemez), ve kritik fonksiyonların hata
// vermeden çalıştığını kontrol eder.
//
// "Maximum call stack size exceeded" gibi hatalar geçmişte
// üç kez şu şekilde oluştu: bir fonksiyon geliştirilirken
//   const _origX = X;
//   function X() { _origX(); ... }
// deseni kullanıldı, ama X'in asıl eski hali silinince
// _origX artık X'in KENDİSİNİ gösterdi → sonsuz döngü.
// Bu script tam olarak bu senaryoyu yakalamak için var.
// ============================================================

process.on('unhandledRejection', () => {}); // ağ hataları test ortamında normal

const { JSDOM } = require('jsdom');
const fs = require('fs');

const htmlPath = process.argv[2] || '/mnt/user-data/outputs/kitap-cafe-sistemi.html';
if (!fs.existsSync(htmlPath)) {
  console.error(`✗ Dosya bulunamadı: ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');

let passCount = 0, failCount = 0;
const results = [];

function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    passCount++;
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
    failCount++;
  }
}

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  url: 'https://izzetfiratorfa.github.io/stalcker/',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
    window.fetch = () => Promise.reject(new Error('test-ortaminda-ag-yok'));
    window.URL.createObjectURL = () => 'blob:fake';
  }
});
const window = dom.window;
window.addEventListener('error', () => {});

setTimeout(() => {
  window.eval(`
    books = [
      { id: 1, title: 'Test Kitap Bir', author: 'Yazar Bir', shelf: 'A1', genre: 'Roman', status: 'yerlesik', tags: 'test,deneme', publisher: 'Test Yayınevi', price: 0 },
      { id: 2, title: 'İkinci Kitap', author: 'Yazar İki', shelf: 'B2', genre: 'Şiir', status: 'satista', price: 50 },
      { id: 3, title: 'Üçüncü Deneme', author: 'Yazar Üç', shelf: 'C3', genre: 'Deneme', status: 'yerlesik', nora_pick: true },
      { id: 4, title: 'Satılan Kitap', author: 'Yazar Dört', shelf: 'A2', genre: 'Roman', status: 'satildi' },
    ];
  `);

  check('renderAdminTable() çalışıyor mu', () => {
    window.renderAdminTable();
    const tbody = window.document.getElementById('adminTableBody');
    const rows = (tbody.innerHTML.match(/class="table-row/g) || []).length;
    if (rows !== 4) throw new Error(`4 satır bekleniyordu, ${rows} bulundu`);
  });

  check('adminTableReset() arama ile çalışıyor mu', () => {
    window.document.getElementById('adminSearch').value = 'ikinci';
    window.adminTableReset();
    const tbody = window.document.getElementById('adminTableBody');
    if (!tbody.innerHTML.includes('İkinci Kitap')) throw new Error('Arama sonucu bulunamadı');
    window.document.getElementById('adminSearch').value = '';
  });

  check('Tür filtresi çalışıyor mu', () => {
    const sel = window.document.getElementById('adminFilterGenre');
    sel.value = 'Roman';
    window.adminTableReset();
    const tbody = window.document.getElementById('adminTableBody');
    const rows = (tbody.innerHTML.match(/class="table-row/g) || []).length;
    // Admin panelinde Roman türünde 2 kitap var: id1 (yerlesik) + id4 (satildi) — ikisi de admin'de görünmeli
    if (rows !== 2) throw new Error(`Roman türünde 2 kitap bekleniyordu (satılan dahil), ${rows} bulundu`);
    sel.value = '';
    window.adminTableReset();
  });

  check('Panel açılışında eski filtre sessizce geri yüklenmiyor', () => {
    window.localStorage.setItem('nora_filter_memory', JSON.stringify({
      search: 'eski-arama-metni', genre: 'Tarih', status: 'satildi',
      shelf: '', sort: 'title', sortDir: 'asc', nora: '', tags: '', savedAt: Date.now()
    }));
    window.initAdminPanel();
  });

  setTimeout(() => {
    check('600ms sonra adminSearch hâlâ boş mu', () => {
      const val = window.document.getElementById('adminSearch').value;
      if (val === 'eski-arama-metni') throw new Error('Eski arama metni sessizce geri geldi!');
    });

    const detailTest = window.openDetail(1).then(() => {
      check('openDetail() hata vermeden çalışıyor mu', () => {
        const overlay = window.document.getElementById('detailOverlay');
        if (!overlay.classList.contains('open')) throw new Error('Detay paneli açılmadı');
        window.closeDetail();
      });
    }).catch(e => {
      results.push({ name: 'openDetail() hata vermeden çalışıyor mu', ok: false, error: e.message });
      failCount++;
    });

    check('renderBookCard() çalışıyor mu', () => {
      const r = window.eval(`
        (function() {
          try { return { ok: true, html: renderBookCard(books[0]) }; }
          catch(e) { return { ok: false, msg: e.message }; }
        })();
      `);
      if (!r.ok) throw new Error(r.msg);
      if (!r.html || !r.html.includes('Test Kitap Bir')) throw new Error('Kart HTML üretilemedi');
    });

    check('Admin sıfır sonuç durumu (boş durum ekranı) hata vermiyor mu', () => {
      window.document.getElementById('adminSearch').value = 'bulunamayacak-bir-kelime-xyz';
      window.adminTableReset();
      const tbody = window.document.getElementById('adminTableBody');
      if (!tbody.innerHTML.includes('kitap yok') && !tbody.innerHTML.includes('bulunan kitap yok')) {
        throw new Error('Boş durum mesajı beklenen içeriği içermiyor');
      }
      window.document.getElementById('adminSearch').value = '';
      window.adminTableReset();
    });

    check('_orig wrapper desenlerinde sonsuz döngü riski yok', () => {
      const src = fs.readFileSync(htmlPath, 'utf8');
      const fnDefs = [...src.matchAll(/(?:async )?function (\w+)\s*\(/g)].map(m => m[1]);
      const counts = {};
      fnDefs.forEach(f => counts[f] = (counts[f]||0)+1);
      const origAssigns = [...src.matchAll(/const (_orig\w+)\s*=\s*(\w+);/g)];
      const dangerous = [];
      origAssigns.forEach(([, varName, fn]) => {
        const idx = src.indexOf(`const ${varName} = ${fn};`);
        const after = src.slice(idx, idx + 300);
        const followedByDecl = new RegExp(`function ${fn}\\s*\\(`).test(after);
        const used = src.includes(varName + '(');
        if (followedByDecl && used) dangerous.push(varName);
      });
      if (dangerous.length) throw new Error(`Riskli wrapper(lar): ${dangerous.join(', ')}`);
    });

    detailTest.finally(() => {
      console.log('\n' + '='.repeat(50));
      console.log('REGRESYON TEST SONUÇLARI');
      console.log('='.repeat(50));
      results.forEach(r => {
        console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.ok ? '' : ' — ' + r.error}`);
      });
      console.log('='.repeat(50));
      console.log(`${passCount} geçti, ${failCount} başarısız`);
      console.log('='.repeat(50));
      process.exit(failCount > 0 ? 1 : 0);
    });
  }, 700);
}, 1500);
