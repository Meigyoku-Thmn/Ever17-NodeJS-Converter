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

**Structure:**

```
8x
```

Value: `x`

**Example:**

* `81`: value = `1`
* `8A`: value = `0xA` = `10`

### 0xAX

**Structure:**

```
Ax yy
```

Value: `(x << 8) + yy`

**Example:**

* `A2 4F`: value = `0x24F` = `591`
* `AB 14`: value = `0xB14` = `2836`

### 0xBX (negative number)

**Structure:**

```
Bx yy
```

Value: `((x << 8) + yy) | 0xFFFFF000`

**Example:**

* `BE 70`: value = `0xE70 | 0xFFFFF000` = `-400`
* `BC 60`: value = `0xC60 | 0xFFFFF000` = `-928`

## Config value (`0xCX`)

**Structure:**

```
Cx yy zz
```

Value: `(x, yy, zz)`

**Example:**

* `C0 {3D} {27}`: value = `(0x0, 0x3D, 0x27)`
* `CC {00} {00}`: value = `(0xC, 0x00, 0x00)`

## RGBA value (`0xE0`)

**Structure:**

```
E0 rr gg bb aa
```

Value: `(rr, gg, bb, aa)`

**Example:**

* `E0 {F0} {F0} {F0} {00}`: value = `rgba(0xF0, 0xF0, 0xF0, 0x00)` = `rgba(240, 240, 240, 0)`
* `E0 {00} {00} {40} {00}`: value = `rgba(0x00, 0x00, 0x40, 0x00)` = `rgba(0, 0, 64, 0)`

## Operators (`0x1X`, `0x2X`)

**Structure:**

```
xx
```

Meaning of the value xx:

* `0x14`: Assign `:=`
* `0x17`: AddAssign `+=`
* `0x0c`: Equal `=`
* `0x0d`: NotEqual `!=`
* `0x0e`: LessThanOrEqual `<=`
* `0x0f`: GreaterThanOrEqual `>=`
* `0x10`: LessThan `<`
* `0x11`: GreaterThan `>`

## Variable reference

This actually has 2 bytes, but the 2nd byte is constant across the script, so we can safety assume it as a trash byte.

###  Type 1 (`0x2a 0x0a`)

Sessional and Global variable.

**Structure:**

```
2a
```

It's expected that the next expression of this is a number value that specifies the address of the variable.

**Example:**

* `28 [0A] {A4 b0 00 00}`: `ref(0x4B0)`
* `28 [0A] {A4 b2 00 00}`: `ref(0x4B2)`

### Type 2 (`0x2d 0x0a`)

Movie-state related variable.

**Structure:**

```
2d
```

It's expected that the next expression of this is a number value that specifies the address of the variable.

**Example:**

* `2D [0A] {87 00 00}`: `m_ref(7)`

## Random function call (`0x33`)

This actually has 2 bytes, but the 2nd byte is constant across the script, so we can safety assume it as a trash byte.

**Structure:**

```
33
```

It's expected that the next expression of this is a number value that specifies the max value for the random function.

The result is an integer number from 0 to less than max value.

**Example:**

* `33 [0A] {87 00 00}`: `random(7)` ∈ `[0..7)`
* `33 [0A] {83 00 00} `: `random(3)` ∈ `[0..3)`

# Meta Instructions

## Flow control (`0x00`)

Marks a flow instruction.

**Structure:**

```
00 <Flow instruction>
```

## Command (`0x10`)

Marks a command instruction.

**Structure:**

```
10 <Command instruction>
```

## Variable operation (`0xff`)

Marks an expression chain that evaluates an expression and assigns it to a variable.

**Structure:**

```
FF <Expression chain>
```

It's expected that the left of the expression chain specifies a variable, the middle specifies an operator, and the right specifies an expression that can be evaluated to a value/config.

## Textual routine call (`0xfe`)

Call into a textual routine using an ordinal.

**Structure:**

```
FE xx yy
```

Ordinal: `xx + (yy << 8)`

Using this ordinal to get the corresponding routine position in the **Textual script index table** to know where to call into.

# Flow Instructions

## End (`0x00`)

Marks the end of main instruction section in a script file.

## Delay (`0x05`)

Spends some graphical frames doing nothing. The player cannot skip by interaction.

**Structure:**

```
05 <Expression chain>
```

Expression chain contains only one number expression: `nFrame` to wait.

**Example:**

* `05 {a0 30 00 00}`: delay for 48 frames.
* `05 {83 00 00}`: delay for 3 frames.

## Suspend (`0x06`)

Stops the main script execution, this marks the end of a game session.

## Goto (`0x07`)

Jumps to a main instruction specified by an ordinal.

**Structure:**

```
07 xx yy
```

* **Ordinal:** `xx + (yy << 8)`

Using this `ordinal` to get the corresponding instruction position in the **Main script index table** to know where to jump to.

## GotoIf (`0x0a`)

Jumps to a main instruction specified by an ordinal if comparison is considered `TRUE`.

**Structure:**

```
0D <Mode> <Expression chain> <2-byte: Ordinal>
```

* **Mode:**
  * If `0` then expression chain's result is compared to `FALSE`
  * If `1` then expression chain's result is compared to `TRUE`
* **Expression chain:** is evaluated to `TRUE` or `FALSE`
* **Ordinal:** use this to get the corresponding instruction position in the **Main script index table** to know where to jump to.

## Call (`0x0d`)

Calls a routine in a script stack specified by an ordinal.

When you start the game, it calls into `startup.scr`, then into `system.scr`, then into a game script. That makes a "script stack" like this (growing downward):

0. `startup.scr`
1. `system.scr`
2. `<gamescript>.scr`

This instruction allows the game to call into a routine defined in `startup.scr` or `system.scr`. 

**Structure:**

```
0D <Expression chain> <2-byte: Ordinal>
```

* **Expression chain:**
  * If value is `0` then the called routine is in `startup.scr`
  * If value is `1` then the called routine is in `system.scr`
* **Ordinal:** corresponding to a routine in the selected `*.scr` file above.

## TurnFlagOn (`0x12`)

Turns on a system flag.

**Structure:**

```
12 <Expression chain>
```

* Expression chain: evaluated to the flag id.

## TurnFlagOff (`0x13`)

Turns of a system flag.

**Structure:**

```
13 <Expression chain>
```

* Expression chain: evaluated to the flag id.

## GotoIfFlag (`0x15`)

Jumps to a main instruction specified by an ordinal if a game flag is considered `TRUE`.

**Structure:**

```
15 <Left operand> <Expression chain: Flag id> <Expression chain: Slot> <Ordinal>
```

* Left operand: the left operand in the comparison
* Flag id: id of a game flag
* Slot: the slot that contains the selected game flag
* Ordinal: use this to get the corresponding instruction position in the **Main script index table** to know where to jump to.

The selected game flag is considered `TRUE` if it equals to the left operand.

## TurnMode (`0x19`)

Set a state for a movie-related mode in the game.

**Structure:**

```
19 <Expression chain: Mode id> <Expression chain: State id>
```

* Mode id: the movie-related mode id
* State id: represents the state to set to the selected mode

## Switch (`0x26`)

A [switch statement](https://en.wikipedia.org/wiki/Switch_statement).

**Structure:**

```
26 <Expression chain: Control value>
00 27 <Expression chain: Case> <2-byte: Ordinal>
...
```

* Control value: the value that will be compared to **cases**
* Case: If `control value` equals to a case, then the execution will jump to the instruction specified by its' associated ordinal
* Ordinal: use this to get the corresponding instruction position in the **Main script index table** to know where to jump to.

A switch statement can be followed by many cases, the interpreter has to keep scanning unill it doesn't see anymore case (begins with `00 27`).

Most of the time, control value is an variable.

## TurnFlag25On (`0x28`)

Same behavior as **TurnFlagOn** but for flag id `0x28`.

# Command Instructions

## ToFile (`0x01`)

Jumps to a script file.

**Structure:**

```
01 <Null-terminated string: Script name>
```

* Script name: the name of script file

**Example:**

* `01 {54 5f 31 41 00}`: Jump to `T_1A`
* `01 {53 43 31 42 00}`: Jump to `SC1B`

## PlayBGM (`0x03`)

Plays a BGM with a specified volume.

**Structure:**

```
03 <Expression chain: BGM ordinal> <Expression chain: Volume>
```

* BGM ordinal: corresponding to a bgm file name: `bgm<ordinal>` in which ordinal is converted to 2-char string.
* Volume: bgm volume.

**Example:**

* `03 {81 00 00} {a0 64 00 00}`: Play `bgm01` with volume `100`
* `03 {8f 00 00} {a0 61 00 00}`: Play `bgm15` with volume `97`

## StopBGM (`0x04`)

Stops the current playing BGM.

## PlaySFX (`0x05`)

Plays a sound effect with a specified volume.

**Structure:**

```
05 <Null-terminated string: Sound name> <Expression chain: No loop> <Expression chain: Volume>
```

* **Sound name:** the name of the sound effect
* **No loop:** `0` or `1`, `1` means to explicitly play a sound effect without looping (this is useless all the time in the script)
* **Volume:** sound volume

The game has an internal configuration that specifies what sound file it has to loop and loop at what range.

## StopSFX (`0x06`)

Stops the current playing sound effect.

## WaitSFX (`0x07`)

Waits until the current sound effect ends.

## PlayVoice (`0x08`)

Plays a voice.

**Structure:**

```
08 <Null-terminated string: Voice name>
```

* **Voice name:** the name of voice file.

## WaitVoice (`0x09`)

Waits until the current voice ends.

## LoadBG (`0x0c`)

Loads a background image, clears every foreground images on the screen and reset the foreground rendering order. You can specify a transition effect.

**Structure:**

```
0c 00 00 00 00 <2-byte: Ordinal> <Expression chain: a1> <Expression chain: a2>
```

* **Ordinal:** use this to get the corresponding image name in the **Image index table**.
* **a1:** Transition effect code 1
* **a2:** Transition effect code 2

## RemoveBG (`0x0d`)

Changes the current background image to a **black** or **white** image. You can specify a transition effect.

**Structure:**

```
0d <Expression chain: Target image> <Expression chain: a1> <Expression chain: a2>
```

* **Target image:** `0` is black image, `1` is white image
* **a1:** Transition effect code 1
* **a2:** Transition effect code 2

## LoadFG (`0x0f`)

Loads a foreground image into a foreground slot. You can specify a horizontal position and enable transition effect.

**Structure:**

```
0f <Expr chain: FG Slot Selector> 00 00 00 00 <2-byte: Ordinal> <Expr chain: HPos> <Expr chain: Mode>
```

* **FG Slot Selector:** specifies the foreground slot to place the foreground image into, valid values are `1`, `2` and`4`
  * `1`: select slot `0`
  * `2`: select slot `1`
  * `4`: select slot `2`
* **Ordinal:** use this to get the corresponding image name in the **Image index table**.
* **HPos:** the horizontal position for the specified foreground image, it has to be calculate like this: `800 * HPos / 640`
* **Mode:** if it is **non-zero**, then use fade-in effect for the foreground image

The HPos is used based on the origin point in the metadata of the specified foreground image. 

## RemoveFG (`0x10`)

Removes a foreground image. You can specify transition effect.

See the **LoadFG** section to know how a slot is picked.

**Structure:**

```
10 <Expression chain: FG Slot Selector> <Expression chain: Mode>
```

* **FG Slot Selector:** specifies the foreground slot from which the foreground image is removed, valid values are `1`, `2` and`4`
* **Mode:** if it is **non-zero**, then use fade-out effect for the foreground image

## LoadFG2 (`0x12`)

Loads 2 foreground images into 2 foreground slots. You can specify 2 horizontal positions and enable transition effect.

See the **LoadFG** section to know how a slot is picked and how HPos is used.

**Structure:**

```
12 <Expr chain: FG Slot 1 Selector> <Expr chain: FG Slot 2 Selector>
   00 00 00 00 <2-byte: Ordinal 1> 00 00 00 00 <2-byte: Ordinal 2> 
   <Expr chain: HPos 1> <Expr chain: HPos 2> <Expr chain: Mode>
```

* **FG Slot 1 Selector:**  picks the 1st foreground slot to place the first foreground image into, valid values are `1`, `2` and`4`
* **FG Slot 2 Selector:** picks the 2nd foreground slot to place the second foreground image into, valid values are `1`, `2` and`4`
* **Ordinal 1:** corresponding to image name in the **Image index table** as the first foreground image
* **Ordinal 2: **corresponding to image name in the **Image index table** as the second foreground image
* **HPos 1:** the horizontal position for the 1st foreground image, it has to be calculate like this: `800 * HPos / 640`
* **HPos 2:** the horizontal position for the 2nd foreground image, it has to be calculate like this: `800 * HPos / 640`
* **Mode:** if it is **non-zero**, then use fade-in effect for the foreground image

## RemoveFG3 (`0x13`)

Removes some foreground images. You can specify transition effect.

**Structure:**

```
13 <Expression chain: FG Slots Selector> <Expression chain: Mode>
```

* **FG Slots Selector:** A bit field that specifies which slot is selected to remove image, only the first 3 bits matter
  * If bit **0th** is set, then slot `0` is selected
  * If bit **1st** is set, then slot `1` is selected
  * If bit **2nd** is set, then slot `2` is selected
* **Mode:** if it is **non-zero**, then use fade-out effect for the foreground image

## SetFGOrder (`0x14`)

Sets the rendering order of foreground slots. You can list 3 slot ids and the game would render them in the listed order.

**Structure:**

```
14 <Expression chain: 1st slot id> <Expression chain: 2nd slot id> <Expression chain: 3rd slot id>
```

* **1st/2nd/3rd Slot id:** the slot ids, valid values are `0`, `1` and `2`; a value can not be reused.
  * The **3rd slot id** can be set as `255` and would be treated as `2`

The game would render the foreground **from the 1st id to the 3rd id**, putting the images **from front to back** respectively.

## AffectFG (`0x15`)

Applied an effect to a foreground slot.

**Structure:**

```
15 <Expression chain: Slot id> <Expression chain: Effect>
```

* **Slot id:** id of the slot to be applied effect
* **Effect:**
  * If this is from `0` to `15`: this is the opacity, it has to be calculated as: `100 * effect / 15`
  * Otherwise, from `16` to `21`: effect id of a illuminance effect, this overrides any other effect on the slot

## LoadFG3 (`0x16`)

Loads 3 foreground images into slot 0, 1 and 2. You can specify 3 horizontal positions and enable transition effect.

See the **LoadFG** section to know how HPos is used.

**Structure:**

```
16 00 00 00 00 <2-byte: Ordinal 1> 00 00 00 00 <2-byte: Ordinal 2> 00 00 00 00 <2-byte: Ordinal 3>
   <Expr chain: HPos 1> <Expr chain: HPos 2> <Expr chain: HPos 3> <Expr chain: Mode>
```

* **Ordinal 1:** corresponding to image name in the **Image index table** as the foreground image for slot id 0
* **Ordinal 2: **corresponding to image name in the **Image index table** as the foreground image for slot id 1
* **Ordinal 3: **corresponding to image name in the **Image index table** as the foreground image for slot id 2
* **HPos 1:** the horizontal position for the 1st foreground image, it has to be calculate like this: `800 * HPos / 640`
* **HPos 2: **the horizontal position for the 2nd foreground image, it has to be calculate like this: `800 * HPos / 640`
* **HPos 3: **the horizontal position for the 3rd foreground image, it has to be calculate like this: `800 * HPos / 640`
* **Mode:** if it is **non-zero**, then use fade-in effect for the foreground image

## HideDialog (`0x18`)

Hides the dialogue text box, using a fade-out effect.

## ShowDialog (`0x19`)

Shows the dialogue text box, using a fade-in effect.

## MarkChoiceId (`0x1a`)

Unknown, not important.

**Structure:**

```
1a <Expression chain> <Expression chain>
```

## ShowChapter (`0x1d`)

Displays the chapter title animation, then prints a date to the backlog.

**Structure:**

```
1d 00 00 00 00 <2-byte: Ordinal>
```

* **Ordinal:** corresponding to image name in the **Image index table** as a background image

## Delay (`0x1e`)

Spends some graphical frames doing nothing. Similar to the flow instruction **Delay** but the player can skip by interaction.

**Structure:**

```
05 <Expression chain: nFrame>
```

* **nFrame:** the number of frames to wait

## ShowClock (`0x1f`)

Displays a digital clock for several seconds, then hides it.

**Structure:**

```
1f <Expression chain: Hour number> <Expression chain; Minute number>
```

## StartAnim (`0x20`)

Plays an animation.

**Structure:**

```
20 <Expression chain: Anim id>
```

* **Anim id:** the animation id to play (this is not the same as the one in **CloseAnim**)

## CloseAnim (`0x21`)

Closes a looped animation on-screen.

**Structure:**

```
21 <Expression chain: Anim id>
```

* **Anim id:** the animation id to close (this is not the same as the one in **StartAnim**)

## MarkLocationId (`0x24`)

Unknown, not important.

**Structure:**

```
24 <Expression chain>
```

## LoadBGKeepFG (`0x27`)

Loads a background image, but keeps the foreground images on the screen. You can specify a transition effect.

**Structure:**

```
27 00 00 00 00 <2-byte: Ordinal> <Expression chain: a1> <Expression chain: a2>
```

* **Ordinal:** use this to get the corresponding image name in the **Image index table**.
* **a1:** Transition effect code 1
* **a2:** Transition effect code 2

## Unk2B (`0x2b`)

Unknown, not important.

**Structure:**

```
2b <Expression chain>
```

## UnlockImage (`0x37`)

Unlocks an image so that it can be seen in the album.

```
37 00 00 00 00 <2-byte: Ordinal>
```

* **Ordinal:** use this to get the corresponding image name in the **Image index table**.

## OpenMovie (`0x39`)

Loads a movie into memory.

**Structure:**

```
39 <Null-terminated string: Name>
```

* **Name:** name of the movie file

## StopMovie (`0x3A`)

Stops the currently playing movie.

## SetMovieRect (`0x3B`)

Sets the rectangle view for the currently loaded movie.

**Structure:**

```
3b <Expression chain: mode>
```

* **Mode:**
  * `0`: the movie is played normally
  * `1`: the movie is flipped vertically

## PlayMovie (`0x3C`)

Plays the currently loaded movie.

## LoadBGCrop (`0x40`)

Loads a background image, clears every foreground images on the screen and reset the foreground rendering order. You can specify a transition effect. The image is applied a crop effect and is stretched to fill the screen.

**Structure:**

```
40 00 00 00 00 <2-byte: Ordinal>
   <Expression chain: a1> <Expression chain: a2>
   <Expression chain: x> <Expression chain: y>
   <Expression chain: hx> <Expression chain: hy>
```

* **Ordinal:** use this to get the corresponding image name in the **Image index table**.
* **a1:** Transition effect code 1
* **a2:** Transition effect code 2
* **x** and **y:** where on the image to start cropping
* **hx** and **hy:** the **width** and **height** to crop, can be set as a negative number to create a flipped image

## ChangeBGCrop (`0x41`)

Transitions the current crop effect of the current background image to a new one. The background image is keep stretched to fill the screen.

**Structure:**

```
41 <Expr chain: x> <Expr chain: y> <Expr chain: hx> <Expr chain: hy> <Expr chain: nFrame>
```

* **x** and **y:** the new point on the image to start cropping
* **hx** and **hy:** the new **width** and new **height** to crop, can be set as a negative number to create a flipped image
* **nFrame:** number of frames as a duration for this transition

## SetVolume (`0x43`)

Sets the audio volume.

**Structure:**

```*
43 <Expression chain: volume>
```

* **Volume:** the audio volume level from `0` to `100`

## OverlayMono (`0x45`)

Shows a black or white overlay on screen using fade-in transition effect.

**Structure:**

```
45 <Expression chain: nFrame> <Expression chain: code>
```

* **nFrame:** number of frames as a duration for this transition
* **code:**
  * `0`: **black** overlay
  * `1`: **white** overlay

## SetDialogColor (`0x46`)

Sets the color of the dialogue text box

**Structure:**

```
46 <Expression chain: code>
```

* **code:**
  * `0`: **blue** text box
  * `1`: **green** text box
  * `2`: **gray** text box (default when starting the game)

# Textual Instructions

## End (`0x00`)

Returns to the main script section.

## NewLine (`0x01`)

Moves to the next line.

## Wait (`0x02`)

Waits for player's interaction.

## Clear (`0x03`)

Clears all characters in text box and resets text state.

## Sleep (`0x04`)

Pause the **current thread** for some graphical frames.

**Structure:**

```
04 <Expression chain: nFrame>
```

* **nFrame:** number of frames to pause

## MarkLog (`0x05`)

Unknown, not important.

**Structure:**

```
05 <Expression chain>
```

## Choice (`0x0b`)

Displays a multiple-choice dialog box.

**Structure:**

```
0B 01 <2-byte: id>
   0B <1-byte: type> [<Expression chain: choiceCond>] <01-terminated string: selectionStr>
   ...
```

* **id:** id of the choice
* **type:** the type of a selection
  * if `1` then the selection doesn't have choiceCond
  * if `2` then the interpreter has to read choiceCond next
* **choiceCond:** the selection would only be shown if the condition is TRUE
* **selectionStr:** the string content of the selection

A multiple-choice dialog box has many selections, the interpreter has to keep scanning unill it doesn't see anymore selection (begins with `0B`).

## WaitVoice (`0x0c`)

Waits for currently playing voice.

## Voice (`0x0d`)

Play a voice.

**Structure:**

```
0D <Null-terminated string: name>
```

* **name:** name of the voice file

## Mark (`0x0e`)

Marks the last point that you can save.

## Style (`0x10`)

Turn on/off some text state but this has no effect in game.

**Structure:**

```
10 <1-byte unk>
```

## Big (`0x11`)

Makes the consequence characters big.

**Structure:**

```
11 03
```

# Background image transition effects

# Character mapping

The interpreter can read characters from the text stream following the right encoding. Some characters have to be mapped into emojis, or some other characters.

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
