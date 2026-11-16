"""两张卡的几何自洽验算：把所有数字放进同一个 3:4 坐标系核对（只读）。"""
H, W = 1.0, 0.75          # 3:4 竖幅
FACE_W = 0.87 * W         # 固定卡：脸宽占画面宽 87%
CHIN = 0.98               # 固定卡：下巴距画面底边 2%
FACE_H = CHIN             # 固定卡：画面最上缘即发际线

print(f"画幅 3:4 -> W={W:.2f}, H={H:.2f}")
print(f"脸宽 = {FACE_W:.3f}H ；脸高 = {FACE_H:.3f}H")
print(f"脸高/脸宽 = {FACE_H / FACE_W:.3f}      卡写 1.50   {'OK' if abs(FACE_H / FACE_W - 1.50) < 0.05 else 'X'}")
print()

third = FACE_H / 3
brow, subnasale = third, CHIN - third
print(f"三庭各 {third:.4f}H = {third / FACE_H:.3f} 脸高   卡写 1:1:1   OK")
print(f"眉 y={brow:.4f} ；鼻底 y={subnasale:.4f}")
print()

nose_len = 0.26 * FACE_H
nose_root = subnasale - nose_len
gap = nose_root - brow
print(f"鼻长 {nose_len:.4f}H = 0.260 脸高          卡写 0.26   OK")
print(f"鼻根 y={nose_root:.4f} ；鼻根到眉 {gap:.4f}H = {gap / FACE_H:.3f} 脸高   解剖约 0.06~0.08   "
      f"{'OK' if 0.04 < gap / FACE_H < 0.11 else 'X'}")
print(f"鼻根在眉下方？ {nose_root > brow}")
print()

lower = CHIN - subnasale
lip = 0.08 * FACE_H
chin_h = 0.14 * FACE_H
rest = lower - lip - chin_h
print(f"下庭 {lower:.4f}H ；唇厚 {lip:.4f}H ；下巴高 {chin_h:.4f}H")
print(f"剩余（人中+颏唇沟） {rest:.4f}H = {rest / FACE_H:.3f} 脸高   解剖约 0.09~0.13   "
      f"{'OK' if 0.07 < rest / FACE_H < 0.15 else 'X'}")
