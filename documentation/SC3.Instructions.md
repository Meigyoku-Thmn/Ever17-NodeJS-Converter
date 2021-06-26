# The structure of a main instruction

The structure is like this:

```
<Meta Opcode>[Opcode][Arguments]
```

* Meta Opcode: a byte corresponding to a meta instruction;
* Opcode: a byte corresponding to a flow instruction or a command instruction;
* Arguments: for meta instruction or for flow/command instruction.

A script interpreter is supposed to read the meta opcode, and base on that, figure out what kind of data/opcode after that (categorizing).

For example, let's consider the following sequence of bytes:

```
10 46 82 00 00
```

Analyze it and we have:

* Meta Opcode: `10` → following it is a command instruction;
* Command Opcode:  `46` → this is the "SetDialogColor" instruction that take one argument;
* Argument: `82 00 00` → represents the number value 2;

# The structure of a textual instruction

```
<Opcode>[Arguments]
```

* Opcode: a byte corresponding to a textual instruction;
* Arguments: depend on the actual textual instruction.

If opcode is not corresponding to any textual instruction, then it's not a textual instruction but the begining of a text stream.

The end byte of a text stream has to be a valid textual opcode.

The encoding of a text stream is [Code Page 932](https://en.wikipedia.org/wiki/Code_page_932_(Microsoft_Windows)) even in the English version of Ever17.

# The structure of an expression chain

Many number arguments, variable assigment and boolean arguments in the script are represented by "expression chain".

An expression chain is composed from one or many small expressions chaining together.

The structure of an expression chain in the case of a single expression is:

```
<Expression><Trash byte><00>
```

Or in the case of many expressions chaining together:

```
<Expression><Trash byte><Expression><Trash byte>...<Expression><Trash byte><00>
```

To read an expression chain, one can follow this pseudo-code:

1. Scan an expression;
2. Skip a trash byte;
3. Check the current byte, if it's a non-zero value, then goto step 1;
4. We got a chain of expressions.

For example, a variable assignment instruction:

```
fe 28 [0a] a4 b0 [14] 14 [00] 85 [00] 00
```

The bytes inside square brackets are considered "trash byte", analyze this and we have:

* Meta Opcode: `fe` → variable operation meta instruction;
* A chain of expressions:
  * `28 [0a]`: get a variable reference based on the next value address (**ref**);
  * `a4 b0 [14]`: a number value expression representing the number **0x4b0**;
  * `14 [00]`: an operator expression representing an assignment operator (**=**);
  * `85 [00] 00`: a number value expression representing the number **5**, the zero byte at the end indicates that this is the final expression;

We can translate this in a more human-readable form:

```
var_op: ref(0x4b0) = 5
```

# Expressions

## Number value

### 0x8X

Structure:

```
8x
```

Value: `x`

### 0xAX

Structure:

```
Ax yy
```

Value: `(x << 8) + yy`

### 0xBX (negative number)

Structure:

```
Bx yy
```

Value: `((x << 8) + yy) | 0xFFFFF000`

## Config value (`0xCX`)

Structure:

```
Cx yy zz
```

Value: `(x, yy, zz)`

## RGBA value (`0xE0`)

Structure:

```
E0 rr gg bb aa
```

Value: `(rr, gg, bb, aa)`

## Operators (`0x1X`, `0x2X`)

Structure:

```
xx
```

Meaning of the value xx:

* `0x14`: Assign
* `0x17`: AddAssign
* `0x0c`: Equal
* `0x0d`: NotEqual
* `0x0e`: LessThanOrEqual
* `0x0f`: GreaterThanOrEqual
* `0x10`: LessThan
* `0x11`: GreaterThan

## Variable reference

This actually has 2 bytes, but the 2nd byte is constant across the script, so we can safety assume it as a trash byte.

###  Type 1 (`0x2a 0x0a`)

Sessional and Global variable.

Structure:

```
2a
```

It's expected that the next expression of this is a number value that specifies the address of the variable.

### Type 2 (`0x2d 0x0a`)

Movie-state related variable.

Structure:

```
2d
```

It's expected that the next expression of this is a number value that specifies the address of the variable.

## Random function call (`0x33`)

This actually has 2 bytes, but the 2nd byte is constant across the script, so we can safety assume it as a trash byte.

Structure:

```
33
```

It's expected that the next expression of this is a number value that specifies the max value for the random function.

The result is an integer number from 0 to max value.

# Meta Instructions

## Flow control (`0x00`)

Marks a flow instruction.

Structure:

```
00 <Flow instruction>
```

## Command (`0x10`)

Marks a command instruction.

Structure:

```
10 <Command instruction>
```

## Variable operation (`0xff`)

Marks an expression chain that evaluates an expression and assigns it to a variable.

Structure:

```
FF <Expression chain>
```

It's expected that the left of the expression chain specifies a variable, the middle specifies an operator, and the right specifies an expression that can be evaluated to a value/config.

## Textual routine call (`0xfe`)

Call into a textual routine using an ordinal.

Structure:

```
FE xx yy
```

Ordinal: `xx + (yy << 8)`

Using this ordinal to get the corresponding routine position in the **Textual script index table** to know where to call into.

# Flow Instructions

## End (`0x00`)

Marks the end of main instruction section.

## Delay (`0x05`)

Spends some graphical frames doing nothing.

Structure:

```
05 <expression chain>
```

Expression chain contains only one number expression: `nFrame` to wait.

## Suspend (`0x06`)

Stops the main script execution, this marks the end of a game session.

## Goto (`0x07`)

Jump to a main instruction specified by an ordinal.

Structure:

```
07 xx yy
```

* Ordinal: `xx + (yy << 8)`

Using this `ordinal` to get the corresponding instruction position in the **Main script index table** to know where to jump to.

## GotoIf (`0x0a`)
## Call (`0x0d`)
## TurnFlagOn (`0x12`)
## TurnFlagOff (`0x13`)
## GotoIfFlag (`0x15`)
## TurnMode (`0x19`)
## Switch (`0x26`)
## TurnFlag25On (`0x28`)

# Command Instructions

## ToFile (`0x01`)
## PlayBGM (`0x03`)
## StopBGM (`0x04`)
## PlaySFX (`0x05`)
## StopSFX (`0x06`)
## WaitSFX (`0x07`)
## PlayVoice (`0x08`)
## WaitVoice (`0x09`)
## LoadBG (`0x0c`)
## RemoveBG (`0x0d`)
## LoadFG (`0x0f`)
## RemoveFG (`0x10`)
## LoadFG2 (`0x12`)
## RemoveFG3 (`0x13`)
## SetFGOrder (`0x14`)
## AffectFG (`0x15`)
## LoadFG3 (`0x16`)
## HideDialog (`0x18`)
## ShowDialog (`0x19`)
## MarkChoiceId (`0x1a`)
## ShowChapter (`0x1d`)
## Delay (`0x1e`)
## ShowClock (`0x1f`)
## StartAnim (`0x20`)
## CloseAnim (`0x21`)
## MarkLocationId (`0x24`)
## LoadBGKeepFG (`0x27`)
## Unk2B (`0x2b`)
## UnlockImage (`0x37`)
## OpenMovie (`0x39`)
## StopMovie (`0x3A`)
## SetMovieRect (`0x3B`)
## PlayMovie (`0x3C`)
## LoadBGCrop (`0x40`)
## TweenZoom (`0x41`)
## SetVolume (`0x43`)
## OverlayMono (`0x45`)
## SetDialogColor (`0x46`)

# Textual Instructions

## End (`0x00`)
## NewLine (`0x01`)
## Wait (`0x02`)
## Clear (`0x03`)
## Sleep (`0x04`)
## MarkLog (`0x05`)
## Choice (`0x0b`)
## WaitVoice (`0x0c`)
## Voice (`0x0d`)
## Mark (`0x0e`)
## Style (`0x10`)
## Big (`0x11`)

# Character mapping

The interpreter can read characters from the text stream by using the right encoding. Some characters have to be mapped into emojis, or some other characters.

## All versions

| Character | Image | Note                                            |
| --------- | ----- | ----------------------------------------------- |
| ①         | 💧     | It is actually a Double Droplet 💧💧 in the game. |
| ②         | ❤️     |                                                 |
| ③         | 💢     |                                                 |
| ④         | 💦     |                                                 |
| ⑤         | ⭐     |                                                 |
| ⑩         | ä     | For German words                                |
| ⑪         | ö     | For German words                                |
| ⑫         | ü     | For German words                                |
| ⑬         | —     | EM DASH                                         |

Emojis are not used in the English version.

## English version

The english version uses fallback for some characters.

| Character | Fallback | From                        | To                |
| --------- | -------- | --------------------------- | ----------------- |
|           |          | IDEOGRAPHIC SPACE           | SPACE             |
| ，        | ,        | FULLWIDTH COMMA             | COMMA             |
| ．        | .        | FULLWIDTH FULL STOP         | FULL STOP         |
| ？        | ?        | FULLWIDTH QUESTION MARK     | QUESTION MARK     |
| ！        | !        | FULLWIDTH EXCLAMATION MARK  | EXCLAMATION MARK  |
| ／        | /        | FULLWIDTH SOLIDUS           | SOLIDUS           |
| ’         | \        | RIGHT SINGLE QUOTATION MARK | REVERSE SOLIDUS   |
| （        | (        | FULLWIDTH LEFT PARENTHESIS  | LEFT PARENTHESIS  |
| ）        | )        | FULLWIDTH RIGHT PARENTHESIS | RIGHT PARENTHESIS |
| －        | \-       | FULLWIDTH HYPHEN-MINUS      | HYPHEN-MINUS      |
| ＜        | <        | FULLWIDTH LESS-THAN SIGN    | LESS-THAN SIGN    |
| ＞        | \>       | FULLWIDTH GREATER-THAN SIGN | GREATER-THAN SIGN |

In the english version, text stream is supposed to be displayed in [Code Page 1252](https://en.wikipedia.org/wiki/Windows-1252) (it keeps byte values from the text stream, no real decoding process is used).

You may want to add an additional map from `舅` to `än` if you use Code Page 932 to decode for the English version.
