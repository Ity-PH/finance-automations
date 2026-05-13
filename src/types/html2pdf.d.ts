declare module "html2pdf.js" {
  interface Html2PdfOptions {
    margin?: number | number[];
    filename?: string;
    image?: { type?: string; quality?: number };
    html2canvas?: Record<string, unknown>;
    jsPDF?: { unit?: string; format?: string; orientation?: string };
    pagebreak?: Record<string, unknown>;
  }

  interface Html2PdfInstance {
    from(element: HTMLElement | string): Html2PdfInstance;
    set(options: Html2PdfOptions): Html2PdfInstance;
    save(): Promise<void>;
    output(type: "blob"): Promise<Blob>;
    output(type: "datauristring"): Promise<string>;
    output(type: "arraybuffer"): Promise<ArrayBuffer>;
  }

  function html2pdf(): Html2PdfInstance;
  export default html2pdf;
}
