import { useEffect, useRef, useState } from 'react';
import type { MessageState } from '@agent-viewer/shared';

interface MessageLogProps {
  messages: MessageState[];
}

export function MessageLog({ messages }: MessageLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  const handleScroll = () => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 30);
  };

  if (messages.length === 0) {
    return (
      <div style={{ color: 'var(--color-text-dim)', textAlign: 'center', padding: '20px', fontSize: '13px' }}>
        No messages yet
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{ height: '100%', overflowY: 'auto' }}
    >
      {messages.map((msg) => (
        <div key={msg.id} className="message-entry">
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: '2px' }}>
              <span className="message-sender">{msg.from}</span>
              <span className="message-arrow"> → </span>
              <span className="message-recipient">{msg.to}</span>
              <span className="message-time" style={{ marginLeft: '8px' }}>
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{msg.content}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
