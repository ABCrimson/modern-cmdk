'use client';

// apps/playground/src/demos/RTLDemo.tsx
// Right-to-left layout demo with Arabic content, searchable in Arabic through item keywords
// React 19: useId
// All styles use CSS logical properties (inline/block)

import { Command } from 'modern-cmdk/react';
import { useId } from 'react';

export function RTLDemo(): React.ReactNode {
  const headingId = useId();

  return (
    <div className="demo-container" role="region" aria-labelledby={headingId}>
      <h2 className="demo-title" id={headingId}>
        RTL (Right-to-Left) Layout
      </h2>
      <p className="demo-description">
        All styles use CSS logical properties (<code>inline-start</code>, <code>block-end</code>,
        etc.) so the palette mirrors correctly in RTL languages without any additional CSS.
      </p>

      <div dir="rtl" lang="ar" className="rtl-container">
        <Command className="command-palette" label="لوحة الأوامر">
          <Command.Input placeholder="بحث…" />
          <Command.List>
            <Command.Empty>لا توجد نتائج</Command.Empty>

            <Command.Group heading="أوامر">
              <Command.Item value="copy" keywords={['نسخ']}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    📋
                  </span>
                  <span className="item-label">نسخ</span>
                </span>
              </Command.Item>
              <Command.Item value="paste" keywords={['لصق']}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    📋
                  </span>
                  <span className="item-label">لصق</span>
                </span>
              </Command.Item>
              <Command.Item value="cut" keywords={['قص']}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    ✂
                  </span>
                  <span className="item-label">قص</span>
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Separator />

            <Command.Group heading="تنقل">
              <Command.Item value="home" keywords={['الصفحة الرئيسية']}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    🏠
                  </span>
                  <span className="item-label">الصفحة الرئيسية</span>
                </span>
              </Command.Item>
              <Command.Item value="settings" keywords={['الاعدادات']}>
                <span className="item-content">
                  <span className="item-icon" aria-hidden="true">
                    ⚙
                  </span>
                  <span className="item-label">الاعدادات</span>
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
