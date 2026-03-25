# chaoxing

Auto-generated from `src/clis/chaoxing` source files.

Total commands: **2**

> 写操作提示：命令名命中高风险动作（如 post/reply/delete/follow/like/block 等）时，执行前必须二次确认。

## Commands

### assignments
- Description: 学习通作业列表
- Risk: low
- Source: `src/clis/chaoxing/assignments.ts`
- Args:
  - `course` (optional) — type=string; 按课程名过滤（模糊匹配）
  - `status` (optional) — type=string; default='all'; 按状态过滤
  - `limit` (optional) — type=int; default=20; 最大返回数量
- Example: `opencli chaoxing assignments -f json`

### exams
- Description: 学习通考试列表
- Risk: low
- Source: `src/clis/chaoxing/exams.ts`
- Args:
  - `course` (optional) — type=string; 按课程名过滤（模糊匹配）
  - `status` (optional) — type=string; default='all'; 按状态过滤
  - `limit` (optional) — type=int; default=20; 最大返回数量
- Example: `opencli chaoxing exams -f json`
