from PIL import Image, ImageDraw, ImageFont
import os

# 创建图片
width, height = 600, 350
img = Image.new('RGB', (width, height), color='#f5f5f5')
draw = ImageDraw.Draw(img)

# 白色容器
container_x, container_y = 50, 20
container_w, container_h = 500, 310
draw.rounded_rectangle([container_x, container_y, container_x+container_w, container_y+container_h], radius=12, fill='white')

# 标题
try:
    font_title = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 16)
    font_label = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 11)
    font_bubble = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 14)
    font_small = ImageFont.truetype("C:/Windows/Fonts/segoeui.ttf", 12)
except:
    font_title = ImageFont.load_default()
    font_label = font_title
    font_bubble = font_title
    font_small = font_title

draw.text((70, 35), "模型 Logo 在气泡外、底部", fill='#333333', font=font_title)
draw.line([(70, 60), (530, 60)], fill='#eeeeee', width=1)

# 消息 1
y = 75
draw.text((70, y), "Claude", fill='#666666', font=font_label)
y += 20
# 气泡
draw.rounded_rectangle([70, y, 70+280, y+40], radius=12, fill='#f2f3f5')
draw.text((80, y+10), "你好！有什么可以帮你的吗？", fill='#333333', font=font_bubble)
y += 48
# 操作按钮
actions = ['📋', '↩', '▶', '👍', '👎', '🔄']
for i, a in enumerate(actions):
    bx = 70 + i * 34
    draw.rounded_rectangle([bx, y, bx+28, y+28], radius=6, fill='#f2f3f5')
    draw.text((bx+6, y+4), a, fill='#999999', font=font_small)
y += 36
# Logo - 用橙色圆点模拟 Claude 星形
draw.ellipse([70, y, 86, y+16], fill='#d97757')

# 保存
img.save('C:/Users/HP/Documents/GitHub/Papyrus_Desktop/chat-bubble-mock.png')
print('mock generated')
