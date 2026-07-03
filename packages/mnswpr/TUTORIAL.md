# Build your own web browser game with `mnswpr` 

Have you ever wondered how games on a web browser are built? Believe it or not, anything you see on a web browser can be built by anyone. That's why the web is so great: it is free and open for everyone to enjoy!

In this guide, we will use **mnswpr** as a simple building block for you to build your own browser game. I will walk you through the steps to create your own Minesweeper browser game from scratch.

If you want to skip to the ending, all the code are in this repository: [minimal-mnswpr](https://github.com/ayo-run/minimal-mnswpr)

First, let's go through the requirements.

## Requirements

It is assumed that you have some knowledge in HTML and JavaScript. You can easily read about this and play around examples online. Some knowledge on using a terminal and a text editor is also required.

You will need a computer with [node.js](https://nodejs.org/en/download).

If you are familiar with HTML and JavaScript, and has a computer with `node.js` installed... let's now start with the project setup!

## Project Setup

Open the terminal and confirm that you have `node.js`.

```bash
# verify the node.js version
node --version # Should print the version
```
Next, create a directory where we'll write some code for your game.

```bash
# on mac or linux
mkdir my-game

cd my-game
```
Once your terminal is in the new directory `my-game`, we will initialize the JavaScript project using the Node Package Manager or `npm`. Type the following on your terminal:

```bash
npm init
```

This will start the `npm` initialization interface, which will ask you some questions. You can think of what you want to answer, but if you want to go with the defaults, you can just press the `Enter` key repeatedly for each until the questions are done.

The last question will ask you if everything is OK:

```bash
Is this OK? (yes)

# Don't be shy, you can just press ENTER again
```

Next, we will add `vite` as a development tool for bundling and as a development server.

<details>
<summary>Additional info on Vite...</summary>
Making web pages work in different browsers often brings challenges brought about by differences in technological implementations and limitations. Vite helps us so that our code will work in different environments without us worrying about issues in compatibility and performance. </details><br />

```bash
npm i -D vite
```

Now that the JS project is initialized and we have a development environment with `vite`, we will install **mnswpr** as a dependency:

```bash
npm i @ayo-run/mnswpr
```

Finally, you can run the installed `vite` dev server by running the following:

```bash
# `npx` here is the execute command for npm
npx vite # will run the vite dev server
```

Vite will now show the address you can type to your browser to see your project. It will show something like this:

```bash
  VITE v8.0.3  ready in 128 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

You can then open the "Local" address (e.g., http://localhost:5173) on your browser.

Congratulations. You now have your project setup! It's time to write some code.

## Write Some Code

Believe it or not, you have done the hard part. Now we start the fun part: putting the parts of your game together!

There are mainly 3 kinds of code that work together in a web page: HTML, JavaScript or JS, and Cascading Style Sheets or CSS.

In this guide, we work mostly with HTML & JS to focus on the basics.

### The HTML

Using your favorite text editor, create a file named `index.html` with the following content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Minesweeper Game</title>
    <style>
        html, body {
            background-color: black;
            color: white;
        }
    </style>
</head>
<body>
    <h1>My Minesweeper Game</h1>
    <div id="app"></div>
    <script type="module" src="main.js"></script>
</body>
</html>
```

<details>
    <summary>Additional info on `index.html`</summary>
    The file name `index.html` is important. It is the default file that Web browsers look for in any given path/directory as the web page it will show.
</details>
<br />

If you have your browser opened to the Local address `vite` just showed earlier, you should see your very first web page with a title **My Minesweeper Game**

Exciting right? You can try editing the text inside `<h1>...</h1>` to see the web page change as well. :)

Take a second to read through the content of your `index.html`. The `<div>` element there with `id="app"` attribute will be where the game board will be rendered.

Now we just need JavaScript to do this. You will find the `<script>` tag that has the `src="main.js"` attribute, which means the web page is ready to load that JavaScript... but this file doesn't exist yet. So let's write the code for that.

### The JavaScript

Create a new file named `main.js` with the following content:

```js
/**
 * main.js
 */
import '@ayo-run/mnswpr/mnswpr.css'
import mnswpr from '@ayo-run/mnswpr'

const game = new mnswpr('app')
game.initialize()
```

When you create this `main.js` file, the dev server will instantly update the web page for you and you should now see your minesweeper browser game!


---

_Just keep building._<br>
_A project by [Ayo](https://ayo.ayco.io)_
