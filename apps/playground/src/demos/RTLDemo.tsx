import { Command } from '@crimson_dev/command-react';

export function RTLDemo() {
  return (
    <div dir="rtl" style={{ fontFamily: 'system-ui' }}>
      <h3>RTL (Right-to-Left) Layout</h3>
      <Command label="RTL palette">
        <Command.Input placeholder="...بحث" />
        <Command.List>
          <Command.Group heading="اوامر">
            <Command.Item value="copy">نسخ</Command.Item>
            <Command.Item value="paste">لصق</Command.Item>
            <Command.Item value="cut">قص</Command.Item>
          </Command.Group>
          <Command.Group heading="تنقل">
            <Command.Item value="home">الصفحة الرئيسية</Command.Item>
            <Command.Item value="settings">الاعدادات</Command.Item>
          </Command.Group>
        </Command.List>
        <Command.Empty>لا توجد نتائج</Command.Empty>
      </Command>
    </div>
  );
}
