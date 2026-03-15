/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_LOGIN_ACCOUNTS?: string;
  readonly VITE_PACK_PRODUCT_NAME?: string;
  readonly VITE_PACK_MODEL_NAME?: string;
  readonly VITE_PACK_LICENSE_NO?: string;
  readonly VITE_PACK_MANUFACTURER_NAME?: string;
  readonly VITE_PACK_MANUFACTURER_ADDR?: string;
  readonly VITE_PACK_MANUFACTURER_TEL_FAX?: string;
  readonly VITE_PACK_SELLER_NAME?: string;
  readonly VITE_PACK_SELLER_PERMIT?: string;
  readonly VITE_PACK_SELLER_ADDR?: string;
  readonly VITE_PACK_SELLER_TEL?: string;
  readonly VITE_PACK_MANUAL_QR_LABEL?: string;
  readonly VITE_PACK_MANUAL_QR_TEXT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
