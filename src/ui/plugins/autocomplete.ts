import { call, autocmd, notify, define, request } from '../neovim-client'
import { cc, Actions, Events, findIndexRight, hasUpperCase } from '../../utils'
import { onVimCreate } from '../sessions'
import { filter } from 'fuzzaldrin-plus'
import { sub } from '../../dispatch'
import { translate } from '../css'
import { h, app } from './plugins'
import ui from '../canvasgrid'
const { cmd, setVar } = notify
const { expr, getCurrentLine } = request

const orderCompletions = (m: string[], query: string) =>
  m.slice().sort(a => hasUpperCase(a) ? -1 : a.startsWith(query) ? -1 : 1)

// TODO: get from lang server
const completionTriggers = new Map<string, RegExp>()
// TODO: $$$$ sign, reallY?
completionTriggers.set('javascript', /[^\w\$\-]/)

interface CompletionOption { id: number, text: string }
interface State { options: CompletionOption[], vis: boolean, ix: number, x: number, y: number }

const state: State = { options: [], vis: false, ix: 0, x: 0, y: 0 }

const view = ({ options, vis, ix, x, y }: State) => h('#autocomplete.plugin', {
  hide: !vis,
  style: { 'justify-content': 'flex-start' }
}, [
  h('div', { style: {
    'min-width': '100px',
    'max-width': '300px',
    position: 'absolute',
    transform: translate(x, y),
  }}, options.map(({ id, text }) => h('.row', {
    key: id,
    css: { active: id === ix },
  }, [
    h('span', text)
  ])))
])

const a: Actions<State> = {}

a.show = (_s, _a, { options, ix, x, y }) => ({ options, ix, x, y, vis: true })
a.hide = () => ({ vis: false, ix: 0 })
a.select = (_s, _a, ix: number) => ({ ix })

const e: Events<State> = {}

// TODO: can we pls bind events to actions? it's always duplicate...
e.show = (_s, a, stuff) => a.show(stuff)
e.hide = (_s, a) => a.hide()
e.select = (_s, a, ix: number) => a.select(ix)

const pluginUI = app({ state, view, actions: a, events: e }, false)

const tempSource = ['saveUserAccount', 'suave', 'getUserVar', 'gurilla', 'geuro', 'guvion', 'yoda', 'obi-wan', 'luke', 'anakin', 'qui-gon', 'leia', 'rey', 'padme', 'vader', 'emperor', 'jar-jar', 'han', 'threepio', 'artoo', 'lando', 'porkins', 'error']

interface G { startIndex: number, completionItems: string[] }

// TODO: i wonder if it might be more prudent to create a veonim plugin and install once...
onVimCreate(() => {
  const g: G = {
    startIndex: 0,
    completionItems: []
  }

  cmd(`aug Veonim | au! | aug END`)

  define.VeonimComplete`
    return a:1 ? g:veonim_complete_pos : g:veonim_completions
  `

  define.CompleteScroll`
    if len(g:veonim_completions)
      if g:veonim_completing
        return a:1 ? "\\<c-n>" : "\\<c-p>"
      endif

      let g:veonim_completing = 1
      return a:1 ? "\\<c-x>\\<c-u>" : "\\<c-x>\\<c-u>\\<c-p>\\<c-p>"
    endif

    return a:1 ? "\\<tab>" : "\\<c-w>"
  `

  setVar('veonim_completing', 0)
  setVar('veonim_complete_pos', 1)
  setVar('veonim_completions', g.completionItems)

  cmd(`set completefunc=VeonimComplete`)
  cmd(`ino <expr> <tab> CompleteScroll(1)`)
  cmd(`ino <expr> <s-tab> CompleteScroll(0)`)

  autocmd.completeDone(async () => {
    setVar('veonim_completing', 0)
    const { word } = await expr(`v:completed_item`)
    // TODO: do what with completed word? mru cache?
    console.log('completed word:', word)
    updateVim([])
  })

  autocmd.insertLeave(() => {
    g.startIndex = 0
    pluginUI('hide')
  })

  const findQuery = (filetype: string, line: string, column: number) => {
    const pattern = completionTriggers.get(filetype) || /[^\w\-]/
    const start = findIndexRight(line, pattern, column - 2) || 0
    const startIndex = start ? start + 1 : 0
    const query = line.slice(startIndex, column - 1) || ''
    const leftChar = line[start]
    // TODO: should startIndex be modified for leftChar?
    return { startIndex, query, leftChar }
  }

  const getPos = async () => {
    // TODO: use nvim_window_* api instead
    const [ buffer, line, column, offset ] = await call.getpos('.')
    return { buffer, line, column, offset }
  }

  const updateVim = (items: string[]) => {
    g.completionItems = items
    // TODO: make sure to validate the right data being sent
    // TODO: send more than just strings. send rich data with id metadata.
    // that way when we get external popup menu notifications we can hook into local
    // richer metadata to populate ui completion menu
    setVar('veonim_completions', items)
  }

  const getCompletions = async () => {
    // TODO: use neovim api built-ins? better perf? line is slowest. could use ui.cursor pos instead of getPos()
    const [ lineData, { line, column } ] = await cc(getCurrentLine(), getPos())
    const { startIndex, query } = findQuery('javascript', lineData, column)

    //console.log(`      `)
    //console.log('startIndex:', startIndex)
    //console.log('query:', JSON.stringify(query))
    //console.log('leftChar:', leftChar)
    // TODO: if (left char is .) we need to do semantic completions
    // left char is === completionTriggers regex
    // set complete_pos
    if (query.length) {
      // TODO: call keywords + semantic = combine -> filter against query
      // TODO: only call this if query has changed 

      // query.toUpperCase() allows the filter engine to rank camel case functions higher
      // aka: saveUserAccount > suave for query: 'sua'
      const completions = filter(tempSource, query.toUpperCase(), { maxResults: 8 }) 

      if (!completions.length) {
        updateVim([])
        pluginUI('hide')
        return
      }

      const orderedCompletions = orderCompletions(completions, query)
      updateVim(orderedCompletions)

      const options = orderedCompletions.map((text, id) => ({ id, text }))
      const y = ui.rowToY(line)
      const x = ui.colToX(Math.max(0, startIndex - 1))
      pluginUI('show', { options, ix: -1, x, y })

      // TODO: do we always need to update this?
      // TODO: cache last position in insert session
      // only update vim if (changed) 
      // use cache - if (same) dont re-ask for keyword/semantic completions from avo
      //if (g.startIndex !== startIndex || !g.visible) {
        //console.log(`showing cmenu`)
        //cmd(`let g:veonim_complete_pos = ${startIndex}`)
        //const { x, y } = await getScreenCursorPos()
        //show(Math.max(0, startIndex - 1), vim.column, x, y)
      //}
      setVar('veonim_complete_pos', startIndex)
    } else {
      pluginUI('hide')
      updateVim([])
    }
  }

  autocmd.cursorMovedI(() => getCompletions())

  sub('pmenu.show', ({ items }) => console.log(items))

  sub('pmenu.select', ix => pluginUI('select', ix))
  sub('pmenu.hide', () => pluginUI('hide'))

  // TODO: yeah good idea, but hook up in neovim instance class
  // get filetype (used to determine separator used for finding startIndex. each lang might be different)
  //autocmd.bufEnter(debounce(async m => {
    //current.file = await call.expand('%f')
    //// TODO: use filetype for js-langs
    //current.filetype = await expr(`&filetype`)
    ////updateServer()
  //}, 100))
})