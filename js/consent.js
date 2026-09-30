/**
 * Sistema de Gestión de Consentimiento (CMP)
 * Cumplimiento de normativas de privacidad (GDPR, LGPD, CCPA)
 * ¿Cómo Pago en Venezuela?
 */

const CMP_STORAGE_KEY = 'como_pago_consent_v1';

const defaultPreferences = {
  necessary: true,     // Imprescindible para funcionamiento básico (estado, tasas, PWA)
  preferences: true,   // Almacenar valores ingresados y tasa promedio personalizada
  analytics: false     // Métricas de uso y telemetría anónima
};

class ConsentManagerClass {
  constructor() {
    this.bannerEl = null;
    this.modalEl = null;
    this.preferences = this.loadPreferences();
    this.init();
  }

  loadPreferences() {
    try {
      const stored = localStorage.getItem(CMP_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...defaultPreferences,
          ...parsed.preferences,
          necessary: true,
          hasAnswered: true,
          timestamp: parsed.timestamp
        };
      }
    } catch (e) {
      console.warn('Error leyendo consentimiento previo:', e);
    }

    return {
      ...defaultPreferences,
      hasAnswered: false,
      timestamp: null
    };
  }

  savePreferences(prefs) {
    const dataToSave = {
      preferences: {
        necessary: true,
        preferences: !!prefs.preferences,
        analytics: !!prefs.analytics
      },
      timestamp: new Date().toISOString(),
      version: '1.0'
    };

    try {
      localStorage.setItem(CMP_STORAGE_KEY, JSON.stringify(dataToSave));
    } catch (e) {
      console.warn('No se pudo guardar preferencias de cookies:', e);
    }

    this.preferences = {
      ...dataToSave.preferences,
      hasAnswered: true,
      timestamp: dataToSave.timestamp
    };

    this.hideBanner();
    this.hideModal();
    this.dispatchChangeEvent();
  }

  acceptAll() {
    this.savePreferences({
      necessary: true,
      preferences: true,
      analytics: true
    });
  }

  rejectNonEssential() {
    this.savePreferences({
      necessary: true,
      preferences: false,
      analytics: false
    });
  }

  saveCustomFromModal() {
    const prefToggle = document.getElementById('cmp-toggle-preferences');
    const analyticsToggle = document.getElementById('cmp-toggle-analytics');

    this.savePreferences({
      necessary: true,
      preferences: prefToggle ? prefToggle.checked : true,
      analytics: analyticsToggle ? analyticsToggle.checked : false
    });
  }

  init() {
    document.addEventListener('DOMContentLoaded', () => {
      this.bannerEl = document.getElementById('cmp-banner');
      this.modalEl = document.getElementById('cmp-modal');

      if (!this.preferences.hasAnswered) {
        // Mostrar banner tras un breve retardo para suavizar la carga
        setTimeout(() => this.showBanner(), 600);
      }

      this.bindEvents();
    });
  }

  bindEvents() {
    // Botón Aceptar Todo en Banner
    const btnAccept = document.getElementById('cmp-btn-accept');
    if (btnAccept) {
      btnAccept.addEventListener('click', () => this.acceptAll());
    }

    // Botón Rechazar no esenciales en Banner
    const btnReject = document.getElementById('cmp-btn-reject');
    if (btnReject) {
      btnReject.addEventListener('click', () => this.rejectNonEssential());
    }

    // Botón Configurar en Banner
    const btnSettings = document.getElementById('cmp-btn-settings');
    if (btnSettings) {
      btnSettings.addEventListener('click', () => {
        this.hideBanner();
        this.openPreferences();
      });
    }

    // Botón Guardar en Modal de Preferencias
    const btnSaveModal = document.getElementById('cmp-btn-save-modal');
    if (btnSaveModal) {
      btnSaveModal.addEventListener('click', () => this.saveCustomFromModal());
    }

    // Botón Cerrar Modal
    const btnCloseModal = document.getElementById('cmp-modal-close');
    if (btnCloseModal) {
      btnCloseModal.addEventListener('click', () => this.hideModal());
    }

    // Cierre al pulsar fuera del modal
    if (this.modalEl) {
      this.modalEl.addEventListener('click', (e) => {
        if (e.target === this.modalEl) {
          this.hideModal();
        }
      });
    }
  }

  showBanner() {
    if (this.bannerEl) {
      this.bannerEl.classList.add('visible');
    }
  }

  hideBanner() {
    if (this.bannerEl) {
      this.bannerEl.classList.remove('visible');
    }
  }

  openPreferences() {
    if (!this.modalEl) {
      this.modalEl = document.getElementById('cmp-modal');
    }
    
    if (this.modalEl) {
      // Actualizar estado de los checkboxes según preferencias vigentes
      const prefToggle = document.getElementById('cmp-toggle-preferences');
      const analyticsToggle = document.getElementById('cmp-toggle-analytics');

      if (prefToggle) prefToggle.checked = this.preferences.preferences !== false;
      if (analyticsToggle) analyticsToggle.checked = !!this.preferences.analytics;

      this.modalEl.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }

  hideModal() {
    if (this.modalEl) {
      this.modalEl.classList.remove('active');
      document.body.style.overflow = '';
    }
  }

  dispatchChangeEvent() {
    window.dispatchEvent(new CustomEvent('consent-changed', {
      detail: { ...this.preferences }
    }));
  }

  hasConsent(category) {
    if (category === 'necessary') return true;
    return !!this.preferences[category];
  }
}

// Instancia global accesible desde cualquier script o enlace de pie de página
window.ConsentManager = new ConsentManagerClass();
export default window.ConsentManager;
