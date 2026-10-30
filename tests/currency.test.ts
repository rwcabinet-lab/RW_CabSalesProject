import { describe, it, expect } from "vitest";
import {
  fromTenThousands,
  toTenThousands,
  formatTenThousands,
  formatNTD,
} from "@/lib/currency";

describe("Currency Utilities (萬元與整數元金融精確度)", () => {
  describe("fromTenThousands (萬元 ➜ 整數元)", () => {
    it("精確轉換小數萬元為整數元，避免 IEEE-754 精度損失", () => {
      expect(fromTenThousands(19.99)).toBe(199900);
      expect(fromTenThousands("19.99")).toBe(199900);
      expect(fromTenThousands(0.5)).toBe(5000);
      expect(fromTenThousands(100)).toBe(1000000);
      expect(fromTenThousands(0.001)).toBe(10);
    });

    it("空值或非法輸入回傳 0", () => {
      expect(fromTenThousands(null)).toBe(0);
      expect(fromTenThousands(undefined)).toBe(0);
      expect(fromTenThousands("")).toBe(0);
      expect(fromTenThousands("invalid")).toBe(0);
    });
  });

  describe("toTenThousands (整數元 ➜ 萬元小數)", () => {
    it("將整數元轉為精確至兩位小數之萬元", () => {
      expect(toTenThousands(199900)).toBe(19.99);
      expect(toTenThousands(5000)).toBe(0.5);
      expect(toTenThousands(123456)).toBe(12.35); // 四捨五入至兩位
      expect(toTenThousands("1000000")).toBe(100);
    });

    it("空值或非法輸入回傳 0", () => {
      expect(toTenThousands(null)).toBe(0);
      expect(toTenThousands(undefined)).toBe(0);
      expect(toTenThousands("")).toBe(0);
    });
  });

  describe("formatTenThousands (萬元格式化顯示)", () => {
    it("整數萬元不顯示多餘小數點", () => {
      expect(formatTenThousands(100000)).toBe("10 萬");
      expect(formatTenThousands(500000)).toBe("50 萬");
    });

    it("小數萬元依據精度格式化", () => {
      expect(formatTenThousands(125000)).toBe("12.5 萬");
      expect(formatTenThousands(123400)).toBe("12.34 萬");
    });

    it("空值或 0 回傳 0 萬", () => {
      expect(formatTenThousands(0)).toBe("0 萬");
      expect(formatTenThousands(null)).toBe("0 萬");
    });
  });

  describe("formatNTD (新台幣整數貨幣字串)", () => {
    it("正確格式化包含千分位逗號與貨幣符號", () => {
      expect(formatNTD(1200000)).toBe("$1,200,000");
      expect(formatNTD(500)).toBe("$500");
      expect(formatNTD(1234.56)).toBe("$1,235"); // 四捨五入
    });

    it("空值回傳 $0", () => {
      expect(formatNTD(null)).toBe("$0");
      expect(formatNTD(undefined)).toBe("$0");
      expect(formatNTD("")).toBe("$0");
    });
  });
});
