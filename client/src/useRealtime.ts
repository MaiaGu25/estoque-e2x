import { useEffect, useRef } from "react";

// Conecta no WebSocket do servidor e chama onChange sempre que o backend
// avisar que algo mudou no módulo indicado. Reconecta sozinho se a conexão
// cair (rede da loja instável, PC do servidor reiniciou, etc.).
export function useRealtime(moduleName: string, onChange: () => void) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.module === moduleName) onChangeRef.current();
        } catch {
          // ignora mensagens que não sejam o formato esperado
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        retryTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close();
    };
  }, [moduleName]);
}
